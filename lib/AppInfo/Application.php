<?php

declare(strict_types=1);

namespace OCA\Artcraft\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\INavigationManager;
use OCP\IURLGenerator;
use OCP\Security\CSP\AddContentSecurityPolicyEvent;
use OCP\Util;

class Application extends App implements IBootstrap {
    public const APP_ID = 'artcraft';

    public function __construct(array $urlParams = []) {
        parent::__construct(self::APP_ID, $urlParams);
    }

    public function register(IRegistrationContext $context): void {
        // Serviços são registrados via DI automática do Nextcloud
    }

    public function boot(IBootContext $context): void {
        $context->injectFn(function (
            INavigationManager $navigationManager,
            IURLGenerator $urlGenerator,
            IEventDispatcher $eventDispatcher
        ): void {
            // 1. Carrega os scripts de integração global (Files, Mail, Talk, Modal Editor)
            $eventDispatcher->addListener(
                BeforeTemplateRenderedEvent::class,
                static function (BeforeTemplateRenderedEvent $event): void {
                    if (!$event->isLoggedIn()) {
                        return;
                    }
                    Util::addStyle(self::APP_ID, 'artcraft');
                    Util::addScript(self::APP_ID, 'artcraft-editor');
                    Util::addScript(self::APP_ID, 'artcraft-files');
                }
            );

            // 2. Permite iframes de mesma origem e blob URLs para impressão/exportação e WebAssembly
            $eventDispatcher->addListener(
                AddContentSecurityPolicyEvent::class,
                static function (AddContentSecurityPolicyEvent $event): void {
                    $csp = new EmptyContentSecurityPolicy();
                    $csp->allowEvalWasm(true);
                    $csp->addAllowedFrameDomain('\'self\'');
                    $csp->addAllowedFrameDomain('blob:');
                    $csp->addAllowedChildSrcDomain('\'self\'');
                    $csp->addAllowedChildSrcDomain('blob:');
                    $csp->addAllowedWorkerSrcDomain('\'self\'');
                    $csp->addAllowedWorkerSrcDomain('blob:');
                    $csp->addAllowedConnectDomain('\'self\'');
                    $csp->addAllowedConnectDomain('blob:');
                    $csp->addAllowedImageDomain('blob:');
                    $csp->addAllowedImageDomain('data:');
                    $event->addPolicy($csp);
                }
            );

            // 3. Registra apenas o ArtCraft Office na barra superior de navegação do Nextcloud
            $navigationManager->add(static function () use ($urlGenerator): array {
                return [
                    'id' => self::APP_ID,
                    'app' => self::APP_ID,
                    'name' => 'ArtCraft Office',
                    'order' => 15,
                    'href' => $urlGenerator->linkToRoute('artcraft.page.index'),
                    'icon' => $urlGenerator->imagePath(self::APP_ID, 'app.svg'),
                ];
            });
        });
    }
}
