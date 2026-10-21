<?php

declare(strict_types=1);

return [
    'routes' => [
        // Páginas dos módulos na barra superior
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
        ['name' => 'page#wordcraft', 'url' => '/wordcraft', 'verb' => 'GET'],
        ['name' => 'page#gridcraft', 'url' => '/gridcraft', 'verb' => 'GET'],
        ['name' => 'page#deckcraft', 'url' => '/deckcraft', 'verb' => 'GET'],

        // API de listagem, leitura, criação e salvamento de arquivos no Nextcloud
        ['name' => 'file#listFiles', 'url' => '/api/files/list/{module}', 'verb' => 'GET'],
        ['name' => 'file#createFile', 'url' => '/api/files/create', 'verb' => 'POST'],
        ['name' => 'file#getMeta', 'url' => '/api/files/{fileId}/meta', 'verb' => 'GET', 'requirements' => ['fileId' => '\d+']],
        ['name' => 'file#getContent', 'url' => '/api/files/{fileId}/content', 'verb' => 'GET', 'requirements' => ['fileId' => '\d+']],
        ['name' => 'file#saveContent', 'url' => '/api/files/{fileId}/save', 'verb' => 'PUT', 'requirements' => ['fileId' => '\d+']],
        ['name' => 'file#saveContentPost', 'url' => '/api/files/{fileId}/save', 'verb' => 'POST', 'requirements' => ['fileId' => '\d+']],
        ['name' => 'file#saveAttachment', 'url' => '/api/files/save-attachment', 'verb' => 'POST'],

        // Servidor de assets estáticos WebAssembly (.html, .js, .wasm, .ico, .png)
        [
            'name' => 'wasm#serve',
            'url' => '/wasm/{module}/{path}',
            'verb' => 'GET',
            'requirements' => ['path' => '.+'],
            'defaults' => ['path' => 'index.html'],
        ],
    ],
];
