<?php

declare(strict_types=1);

namespace OCA\Artcraft\Controller;

use OCA\Artcraft\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\Util;

class PageController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function index(): TemplateResponse {
        return $this->renderModulePage('wordcraft');
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function wordcraft(): TemplateResponse {
        return $this->renderModulePage('wordcraft');
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function gridcraft(): TemplateResponse {
        return $this->renderModulePage('gridcraft');
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function deckcraft(): TemplateResponse {
        return $this->renderModulePage('deckcraft');
    }

    private function renderModulePage(string $module): TemplateResponse {
        Util::addScript(Application::APP_ID, 'artcraft-hub');

        $user = $this->userSession->getUser();
        $displayName = $user !== null ? $user->getDisplayName() : '';
        $fileId = (int)($this->request->getParam('fileId', 0));

        return new TemplateResponse(Application::APP_ID, 'main', [
            'module' => $module,
            'displayName' => $displayName,
            'initialFileId' => $fileId > 0 ? $fileId : null,
        ]);
    }
}
