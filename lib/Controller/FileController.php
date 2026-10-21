<?php

declare(strict_types=1);

namespace OCA\Artcraft\Controller;

use OCA\Artcraft\AppInfo\Application;
use OCA\Artcraft\Service\TemplateService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataDownloadResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IRequest;
use OCP\IUserSession;

class FileController extends Controller {
    private const ALLOWED_SAVE_EXTENSIONS = [
        'docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'odt', 'rtf', 'txt', 'md', 'html', 'pdf',
        'xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv',
        'pptx', 'ppsx', 'potx', 'deckcraft',
        'png', 'jpg', 'jpeg', 'gif',
    ];

    public function __construct(
        IRequest $request,
        private IRootFolder $rootFolder,
        private IUserSession $userSession,
        private TemplateService $templateService,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    /**
     * Lista todos os arquivos compatíveis com o módulo (wordcraft, gridcraft, deckcraft)
     * existentes no Nextcloud do usuário autenticado.
     *
     * @NoAdminRequired
     */
    #[NoAdminRequired]
    public function listFiles(string $module): JSONResponse {
        $userFolder = $this->getUserFolder();
        if ($userFolder === null) {
            return new JSONResponse(['error' => 'Usuário não autenticado'], Http::STATUS_UNAUTHORIZED);
        }

        $extensions = $this->templateService->getExtensionsForModule($module);
        $allFiles = [];
        $this->collectFilesRecursive($userFolder, $userFolder->getPath(), $extensions, $module, $allFiles, 0);

        // Os 4 arquivos mais recentes gerais do módulo (independente de busca/página)
        $byRecent = $allFiles;
        usort($byRecent, static fn (array $a, array $b): int => $b['mtime'] <=> $a['mtime']);
        $recentFiles = array_slice($byRecent, 0, 4);

        // Filtro por pesquisa (nome ou pasta)
        $query = trim((string)$this->request->getParam('q', ''));
        if ($query !== '') {
            $qLower = mb_strtolower($query, 'UTF-8');
            $filtered = array_values(array_filter(
                $allFiles,
                static fn (array $f): bool => str_contains(mb_strtolower((string)$f['name'], 'UTF-8'), $qLower)
                    || str_contains(mb_strtolower((string)$f['folder'], 'UTF-8'), $qLower)
            ));
        } else {
            $filtered = $allFiles;
        }

        // Ordenação
        $sort = strtolower(trim((string)$this->request->getParam('sort', 'mtime')));
        usort($filtered, static function (array $a, array $b) use ($sort): int {
            if ($sort === 'name') {
                return strnatcasecmp((string)$a['name'], (string)$b['name']);
            }
            if ($sort === 'size') {
                return ((int)$b['size']) <=> ((int)$a['size']);
            }
            return ((int)$b['mtime']) <=> ((int)$a['mtime']);
        });

        // Paginação
        $total = count($filtered);
        $perPage = max(1, min(200, (int)$this->request->getParam('perPage', 20)));
        $totalPages = max(1, (int)ceil($total / $perPage));
        $page = max(1, min($totalPages, (int)$this->request->getParam('page', 1)));
        $offset = ($page - 1) * $perPage;
        $pagedFiles = array_slice($filtered, $offset, $perPage);

        return new JSONResponse([
            'module' => strtolower($module),
            'extensions' => $extensions,
            'files' => $pagedFiles,
            'recent' => $recentFiles,
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => $totalPages,
                'hasPrev' => $page > 1,
                'hasNext' => $page < $totalPages,
            ],
        ]);
    }

    /**
     * Cria um novo arquivo em branco (.docx, .xlsx, .pptx) no Nextcloud Files.
     *
     * @NoAdminRequired
     */
    #[NoAdminRequired]
    public function createFile(): JSONResponse {
        $userFolder = $this->getUserFolder();
        if ($userFolder === null) {
            return new JSONResponse(['error' => 'Usuário não autenticado'], Http::STATUS_UNAUTHORIZED);
        }

        $module = strtolower((string)$this->request->getParam('module', 'wordcraft'));
        $defaultExt = $this->templateService->getDefaultExtensionForModule($module);
        $allowedModuleExts = $this->templateService->getExtensionsForModule($module);
        $rawName = trim((string)$this->request->getParam('name', ''));
        $dir = trim((string)$this->request->getParam('dir', '/'));

        $fallbackName = match ($module) {
            'gridcraft' => 'Nova Planilha.' . $defaultExt,
            'deckcraft' => 'Nova Apresentacao.' . $defaultExt,
            default => 'Novo Documento.' . $defaultExt,
        };

        $safeName = $this->sanitizeFileName($rawName, $fallbackName, $defaultExt);
        $ext = strtolower((string)pathinfo($safeName, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedModuleExts, true)) {
            $ext = $defaultExt;
            $stem = (string)pathinfo($safeName, PATHINFO_FILENAME);
            $safeName = ($stem !== '' ? $stem : 'Novo Arquivo') . '.' . $ext;
        }

        $targetFolder = $this->resolveTargetFolder($userFolder, $dir);
        if (!$targetFolder->isCreatable()) {
            return new JSONResponse(['error' => 'Sem permissão para criar arquivo nesta pasta'], Http::STATUS_FORBIDDEN);
        }
        $finalName = $this->findUniqueFileName($targetFolder, $safeName);
        $content = $this->templateService->createBlankContent($ext);

        try {
            $file = $targetFolder->newFile($finalName, $content);
            return new JSONResponse([
                'status' => 'ok',
                'file' => $this->serializeFileNode($file, $userFolder->getPath()),
            ]);
        } catch (NotPermittedException $e) {
            return new JSONResponse(['error' => 'Sem permissão para criar arquivo nesta pasta'], Http::STATUS_FORBIDDEN);
        } catch (\Throwable $e) {
            return new JSONResponse(['error' => 'Falha ao criar arquivo'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Retorna os metadados de um arquivo pelo fileId.
     *
     * @NoAdminRequired
     */
    #[NoAdminRequired]
    public function getMeta(int $fileId): JSONResponse {
        $userFolder = $this->getUserFolder();
        if ($userFolder === null) {
            return new JSONResponse(['error' => 'Usuário não autenticado'], Http::STATUS_UNAUTHORIZED);
        }

        $file = $this->findFileById($userFolder, $fileId);
        if ($file === null || !$file->isReadable()) {
            return new JSONResponse(['error' => 'Arquivo não encontrado'], Http::STATUS_NOT_FOUND);
        }

        return new JSONResponse([
            'status' => 'ok',
            'file' => $this->serializeFileNode($file, $userFolder->getPath()),
        ]);
    }

    /**
     * Faz o download/stream dos bytes brutos do arquivo para abrir no módulo WebAssembly.
     *
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function getContent(int $fileId): DataDownloadResponse|JSONResponse {
        $secFetchSite = strtolower((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
        if ($secFetchSite === 'cross-site') {
            return new JSONResponse(['error' => 'Requisição cross-site bloqueada'], Http::STATUS_FORBIDDEN);
        }

        $userFolder = $this->getUserFolder();
        if ($userFolder === null) {
            return new JSONResponse(['error' => 'Usuário não autenticado'], Http::STATUS_UNAUTHORIZED);
        }

        $file = $this->findFileById($userFolder, $fileId);
        if ($file === null || !$file->isReadable()) {
            return new JSONResponse(['error' => 'Arquivo não encontrado'], Http::STATUS_NOT_FOUND);
        }

        try {
            $content = $file->getContent();
            $mime = $file->getMimeType() ?: 'application/octet-stream';
            return new DataDownloadResponse($content, $file->getName(), $mime);
        } catch (\Throwable $e) {
            return new JSONResponse(['error' => 'Não foi possível ler o arquivo'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Salva os bytes enviados pelo editor WebAssembly no arquivo do Nextcloud
     * (ou cria um arquivo derivado na mesma pasta em caso de exportação PDF / conversão de formato).
     *
     * @NoAdminRequired
     */
    #[NoAdminRequired]
    public function saveContent(int $fileId): JSONResponse {
        return $this->handleSave($fileId);
    }

    /**
     * Alternativa POST para ambientes onde PUT sofre restrições de proxy.
     *
     * @NoAdminRequired
     */
    #[NoAdminRequired]
    public function saveContentPost(int $fileId): JSONResponse {
        return $this->handleSave($fileId);
    }

    /**
     * Salva um anexo (aberto direto do Nextcloud Mail / Talk ou arquivo local) no Nextcloud Files.
     *
     * @NoAdminRequired
     */
    #[NoAdminRequired]
    public function saveAttachment(): JSONResponse {
        $userFolder = $this->getUserFolder();
        if ($userFolder === null) {
            return new JSONResponse(['error' => 'Usuário não autenticado'], Http::STATUS_UNAUTHORIZED);
        }

        $name = trim((string)$this->request->getParam('name', 'Anexo.docx'));
        $dir = trim((string)$this->request->getParam('dir', '/'));
        $bytes = $this->readRequestBytes();

        if ($bytes === '') {
            return new JSONResponse(['error' => 'Conteúdo vazio'], Http::STATUS_BAD_REQUEST);
        }

        $safeName = $this->sanitizeFileName($name, 'Anexo.docx', 'docx');

        $targetFolder = $this->resolveTargetFolder($userFolder, $dir);
        if (!$targetFolder->isCreatable()) {
            return new JSONResponse(['error' => 'Sem permissão para salvar anexo nesta pasta'], Http::STATUS_FORBIDDEN);
        }
        $finalName = $this->findUniqueFileName($targetFolder, $safeName);

        try {
            $file = $targetFolder->newFile($finalName, $bytes);
            return new JSONResponse([
                'status' => 'ok',
                'mode' => 'created',
                'file' => $this->serializeFileNode($file, $userFolder->getPath()),
            ]);
        } catch (NotPermittedException $e) {
            return new JSONResponse(['error' => 'Sem permissão para salvar anexo nesta pasta'], Http::STATUS_FORBIDDEN);
        } catch (\Throwable $e) {
            return new JSONResponse(['error' => 'Falha ao salvar anexo'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    private function handleSave(int $fileId): JSONResponse {
        $userFolder = $this->getUserFolder();
        if ($userFolder === null) {
            return new JSONResponse(['error' => 'Usuário não autenticado'], Http::STATUS_UNAUTHORIZED);
        }

        $file = $this->findFileById($userFolder, $fileId);
        if ($file === null || !$file->isReadable()) {
            return new JSONResponse(['error' => 'Arquivo não encontrado'], Http::STATUS_NOT_FOUND);
        }

        $bytes = $this->readRequestBytes();
        if ($bytes === '' && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
            return new JSONResponse(['error' => 'Não foi possível ler os bytes enviados'], Http::STATUS_BAD_REQUEST);
        }

        $originalName = $file->getName();
        $originalExt = strtolower((string)pathinfo($originalName, PATHINFO_EXTENSION));

        $rawRequestedName = trim((string)$this->request->getParam('name', $originalName));
        $requestedName = $this->sanitizeFileName($rawRequestedName, $originalName, $originalExt ?: 'docx');
        $requestedExt = strtolower((string)pathinfo($requestedName, PATHINFO_EXTENSION));

        $sameFormat = ($requestedExt === '' || $requestedExt === $originalExt);

        try {
            if ($sameFormat) {
                if (!$file->isUpdateable()) {
                    return new JSONResponse(['error' => 'Sem permissão de escrita neste arquivo'], Http::STATUS_FORBIDDEN);
                }
                $file->putContent($bytes);
                return new JSONResponse([
                    'status' => 'ok',
                    'mode' => 'updated',
                    'file' => $this->serializeFileNode($file, $userFolder->getPath()),
                ]);
            }

            // Exportação (ex: PDF) ou conversão de legado (.doc -> .docx / .xls -> .xlsx / .pptx -> .deckcraft):
            // grava na mesma pasta do arquivo original
            $parentFolder = $file->getParent();
            if (!$parentFolder->isCreatable()) {
                return new JSONResponse(['error' => 'Sem permissão de escrita nesta pasta'], Http::STATUS_FORBIDDEN);
            }
            $stem = (string)pathinfo($originalName, PATHINFO_FILENAME);
            $targetName = $requestedName;
            if (preg_match('/^(document|documento|untitled|presentation|apresentacao|book|workbook|planilha)\./i', $requestedName)) {
                $targetName = $stem . '.' . ($requestedExt !== '' ? $requestedExt : $originalExt);
            }

            if ($parentFolder->nodeExists($targetName)) {
                $existingNode = $parentFolder->get($targetName);
                if ($existingNode instanceof File && $existingNode->isUpdateable()) {
                    $existingNode->putContent($bytes);
                    return new JSONResponse([
                        'status' => 'ok',
                        'mode' => 'exported',
                        'file' => $this->serializeFileNode($existingNode, $userFolder->getPath()),
                    ]);
                }
                $targetName = $this->findUniqueFileName($parentFolder, $targetName);
            }

            $newFile = $parentFolder->newFile($targetName, $bytes);
            return new JSONResponse([
                'status' => 'ok',
                'mode' => 'exported',
                'file' => $this->serializeFileNode($newFile, $userFolder->getPath()),
            ]);
        } catch (NotPermittedException $e) {
            return new JSONResponse(['error' => 'Sem permissão de escrita neste arquivo/pasta'], Http::STATUS_FORBIDDEN);
        } catch (\Throwable $e) {
            return new JSONResponse(['error' => 'Erro ao salvar: ' . $e->getMessage()], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    private function readRequestBytes(): string {
        $base64 = $this->request->getParam('dataBase64');
        if (is_string($base64) && $base64 !== '') {
            $decoded = base64_decode($base64, true);
            if ($decoded !== false) {
                return $decoded;
            }
        }
        $raw = file_get_contents('php://input');
        return $raw !== false ? $raw : '';
    }

    private function getUserFolder(): ?Folder {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return null;
        }
        try {
            return $this->rootFolder->getUserFolder($user->getUID());
        } catch (\Throwable) {
            return null;
        }
    }

    private function findFileById(Folder $userFolder, int $fileId): ?File {
        try {
            $nodes = $userFolder->getById($fileId);
            foreach ($nodes as $node) {
                if ($node instanceof File) {
                    return $node;
                }
            }
        } catch (\Throwable) {
            return null;
        }
        return null;
    }

    private function sanitizeFileName(string $rawName, string $fallbackName, string $defaultExt): string {
        $cleaned = str_replace("\0", '', $rawName);
        $cleaned = basename(str_replace('\\', '/', $cleaned));
        // Remove caracteres de controle e caracteres proibidos em sistemas de arquivos
        $cleaned = (string)preg_replace('/[\x00-\x1F\x7F\/\\\\:*?"<>|]+/', '', $cleaned);
        $cleaned = trim($cleaned, " \t\n\r\0\x0B.");

        if ($cleaned === '' || in_array(strtolower($cleaned), ['.', '..', '.htaccess', '.user.ini'], true)) {
            $cleaned = $fallbackName;
        }

        $ext = strtolower((string)pathinfo($cleaned, PATHINFO_EXTENSION));
        $stem = trim((string)pathinfo($cleaned, PATHINFO_FILENAME));
        if ($stem === '') {
            $stem = (string)pathinfo($fallbackName, PATHINFO_FILENAME) ?: 'Documento';
        }
        if ($ext === '' || !in_array($ext, self::ALLOWED_SAVE_EXTENSIONS, true)) {
            $ext = in_array(strtolower($defaultExt), self::ALLOWED_SAVE_EXTENSIONS, true)
                ? strtolower($defaultExt)
                : 'docx';
        }

        return $stem . '.' . $ext;
    }

    private function resolveTargetFolder(Folder $userFolder, string $dir): Folder {
        $normalized = str_replace(['\\', "\0"], ['/', ''], $dir);
        $segments = array_filter(explode('/', $normalized), static fn (string $seg): bool => $seg !== '' && $seg !== '.');
        foreach ($segments as $seg) {
            if ($seg === '..') {
                return $userFolder;
            }
        }
        $cleanDir = '/' . implode('/', $segments);
        if ($cleanDir === '/') {
            return $userFolder;
        }
        try {
            if ($userFolder->nodeExists($cleanDir)) {
                $node = $userFolder->get($cleanDir);
                if ($node instanceof Folder) {
                    return $node;
                }
            } elseif ($userFolder->isCreatable()) {
                return $userFolder->newFolder($cleanDir);
            }
        } catch (\Throwable) {
            // Fallback para a raiz do usuário
        }
        return $userFolder;
    }

    private function findUniqueFileName(Folder $folder, string $desiredName): string {
        if (!$folder->nodeExists($desiredName)) {
            return $desiredName;
        }
        $ext = (string)pathinfo($desiredName, PATHINFO_EXTENSION);
        $stem = (string)pathinfo($desiredName, PATHINFO_FILENAME);
        $suffix = $ext !== '' ? '.' . $ext : '';

        for ($i = 1; $i <= 500; $i++) {
            $candidate = sprintf('%s (%d)%s', $stem, $i, $suffix);
            if (!$folder->nodeExists($candidate)) {
                return $candidate;
            }
        }
        return sprintf('%s_%d%s', $stem, time(), $suffix);
    }

    private function collectFilesRecursive(
        Folder $folder,
        string $rootPrefix,
        array $allowedExtensions,
        string $module,
        array &$results,
        int $depth,
    ): void {
        if ($depth > 12 || count($results) >= 1000) {
            return;
        }

        try {
            $listing = $folder->getDirectoryListing();
        } catch (\Throwable) {
            return;
        }

        foreach ($listing as $node) {
            $name = $node->getName();
            if ($name === '' || str_starts_with($name, '.')) {
                continue;
            }
            if ($node instanceof Folder) {
                $this->collectFilesRecursive($node, $rootPrefix, $allowedExtensions, $module, $results, $depth + 1);
            } elseif ($node instanceof File) {
                $ext = strtolower((string)pathinfo($name, PATHINFO_EXTENSION));
                if (in_array($ext, $allowedExtensions, true)) {
                    $results[] = $this->serializeFileNode($node, $rootPrefix);
                }
            }
        }
    }

    private function serializeFileNode(File $file, string $rootPrefix): array {
        $fullPath = $file->getPath();
        $relPath = str_starts_with($fullPath, $rootPrefix)
            ? substr($fullPath, strlen($rootPrefix))
            : $fullPath;
        if ($relPath === '' || $relPath[0] !== '/') {
            $relPath = '/' . $relPath;
        }
        $folderPath = dirname($relPath);
        if ($folderPath === '\\' || $folderPath === '.') {
            $folderPath = '/';
        }

        $ext = strtolower((string)pathinfo($file->getName(), PATHINFO_EXTENSION));
        $user = $this->userSession->getUser();

        return [
            'id' => $file->getId(),
            'name' => $file->getName(),
            'path' => $relPath,
            'folder' => $folderPath,
            'size' => $file->getSize(),
            'mtime' => $file->getMTime(),
            'mime' => $file->getMimeType() ?: 'application/octet-stream',
            'extension' => $ext,
            'module' => $this->templateService->getModuleForExtension($ext),
            'writable' => ($file->getPermissions() & Constants::PERMISSION_UPDATE) !== 0,
            'author' => $user !== null ? $user->getDisplayName() : '',
        ];
    }
}
