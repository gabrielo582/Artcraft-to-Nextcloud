<?php

declare(strict_types=1);

namespace OCA\Artcraft\Controller;

use OCA\Artcraft\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\IRequest;

class WasmController extends Controller {
    private const ALLOWED_MODULES = ['wordcraft', 'gridcraft', 'deckcraft'];
    private const ALLOWED_EXTENSIONS = ['wasm', 'js', 'mjs', 'html', 'htm', 'css', 'ico', 'png', 'svg', 'json'];

    public function __construct(IRequest $request) {
        parent::__construct(Application::APP_ID, $request);
    }

    /**
     * Serve os arquivos estáticos WebAssembly (.html, .js, .wasm, .ico, .png)
     * com o MIME type `application/wasm` e políticas CSP adequadas para WebGPU/WebGL2.
     *
     * Usa `EmptyContentSecurityPolicy` diretamente para que o `CSPMiddleware` do Nextcloud
     * não force `strict-dynamic` / `nonce` nem remova `'self'` do `script-src`.
     *
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function serve(string $module, string $path = 'index.html'): Response {
        $mod = strtolower(trim($module));
        if (!in_array($mod, self::ALLOWED_MODULES, true)) {
            return new JSONResponse(['error' => 'Módulo inválido'], Http::STATUS_NOT_FOUND);
        }

        $cleanPath = ltrim(str_replace('\\', '/', $path), '/');
        if ($cleanPath === '') {
            $cleanPath = 'index.html';
        }
        if (str_contains($cleanPath, '..') || str_starts_with($cleanPath, '.')) {
            return new JSONResponse(['error' => 'Caminho inválido'], Http::STATUS_FORBIDDEN);
        }

        $baseDir = realpath(__DIR__ . '/../../wasm/' . $mod);
        if ($baseDir === false) {
            return new JSONResponse([
                'error' => sprintf('Módulo WASM "%s" não instalado. Execute scripts/download-wasm.sh.', $mod),
            ], Http::STATUS_NOT_FOUND);
        }

        $filePath = realpath($baseDir . '/' . $cleanPath);
        if ($filePath === false || !str_starts_with($filePath, $baseDir . DIRECTORY_SEPARATOR) || !is_file($filePath)) {
            return new JSONResponse(['error' => 'Arquivo não encontrado'], Http::STATUS_NOT_FOUND);
        }

        $ext = strtolower((string)pathinfo($filePath, PATHINFO_EXTENSION));
        if (!in_array($ext, self::ALLOWED_EXTENSIONS, true)) {
            return new JSONResponse(['error' => 'Extensão não permitida'], Http::STATUS_FORBIDDEN);
        }
        $mimeType = match ($ext) {
            'wasm' => 'application/wasm',
            'js', 'mjs' => 'text/javascript; charset=utf-8',
            'html', 'htm' => 'text/html; charset=utf-8',
            'css' => 'text/css; charset=utf-8',
            'ico' => 'image/x-icon',
            'png' => 'image/png',
            'svg' => 'image/svg+xml',
            'json' => 'application/json; charset=utf-8',
            default => 'application/octet-stream',
        };

        $content = file_get_contents($filePath);
        if ($content === false) {
            return new JSONResponse(['error' => 'Falha ao ler asset WASM'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }

        $response = new DataDisplayResponse($content, Http::STATUS_OK, [
            'Content-Type' => $mimeType,
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'SAMEORIGIN',
        ]);

        if (in_array($ext, ['wasm', 'ico', 'png'], true) || (
            $ext === 'js' && !in_array(basename($filePath), ['host-bridge.js', 'boot.js'], true)
        )) {
            $response->addHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
            $response->addHeader('Cache-Control', 'no-cache');
        }

        // EmptyContentSecurityPolicy faz o CSPMiddleware retornar $response sem injetar jsNonce/strict-dynamic
        $csp = new EmptyContentSecurityPolicy();
        $csp->allowInlineStyle(true);
        $csp->allowEvalScript(true);
        $csp->allowEvalWasm(true);
        $csp->addAllowedScriptDomain('\'self\'');
        $csp->addAllowedScriptDomain('blob:');
        $csp->addAllowedStyleDomain('\'self\'');
        $csp->addAllowedFontDomain('\'self\'');
        $csp->addAllowedFontDomain('data:');
        $csp->addAllowedConnectDomain('\'self\'');
        $csp->addAllowedConnectDomain('blob:');
        $csp->addAllowedMediaDomain('\'self\'');
        $csp->addAllowedMediaDomain('blob:');
        $csp->addAllowedImageDomain('\'self\'');
        $csp->addAllowedImageDomain('data:');
        $csp->addAllowedImageDomain('blob:');
        $csp->addAllowedFrameDomain('\'self\'');
        $csp->addAllowedFrameDomain('blob:');
        $csp->addAllowedChildSrcDomain('\'self\'');
        $csp->addAllowedChildSrcDomain('blob:');
        $csp->addAllowedWorkerSrcDomain('\'self\'');
        $csp->addAllowedWorkerSrcDomain('blob:');
        $csp->addAllowedFormActionDomain('\'self\'');
        $csp->addAllowedFrameAncestorDomain('\'self\'');
        $response->setContentSecurityPolicy($csp);

        return $response;
    }
}
