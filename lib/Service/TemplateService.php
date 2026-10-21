<?php

declare(strict_types=1);

namespace OCA\Artcraft\Service;

use ZipArchive;

/**
 * Generates valid blank OOXML (.docx, .xlsx, .pptx) and text/deckcraft templates
 * when creating new files from Nextcloud Files ("+ Novo") or from the ArtCraft Hub.
 */
class TemplateService {
    public function getModuleForExtension(string $extension): string {
        $ext = strtolower(ltrim($extension, '.'));
        return match ($ext) {
            'xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv' => 'gridcraft',
            'pptx', 'ppsx', 'potx', 'deckcraft', 'odp', 'ppt' => 'deckcraft',
            default => 'wordcraft',
        };
    }

    public function getDefaultExtensionForModule(string $module): string {
        return match (strtolower($module)) {
            'gridcraft' => 'xlsx',
            'deckcraft' => 'pptx',
            default => 'docx',
        };
    }

    public function getExtensionsForModule(string $module): array {
        return match (strtolower($module)) {
            'gridcraft' => ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv'],
            'deckcraft' => ['pptx', 'ppsx', 'potx', 'deckcraft'],
            default => ['docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'odt', 'rtf'],
        };
    }

    public function createBlankContent(string $extension): string {
        $ext = strtolower(ltrim($extension, '.'));
        return match ($ext) {
            'docx' => $this->buildBlankDocx(),
            'xlsx' => $this->buildBlankXlsx(),
            'pptx' => $this->buildBlankPptx(),
            'csv' => "",
            'deckcraft' => json_encode([
                'version' => 1,
                'slides' => [['shapes' => []]],
            ], JSON_PRETTY_PRINT) ?: '{}',
            default => $this->buildBlankDocx(),
        };
    }

    private function buildZipFromEntries(array $entries): string {
        if (class_exists(ZipArchive::class)) {
            $tmpFile = tempnam(sys_get_temp_dir(), 'artcraft_ooxml_');
            if ($tmpFile !== false) {
                $zip = new ZipArchive();
                if ($zip->open($tmpFile, ZipArchive::OVERWRITE | ZipArchive::CREATE) === true) {
                    foreach ($entries as $path => $content) {
                        $zip->addFromString($path, $content);
                    }
                    $zip->close();
                    $bytes = file_get_contents($tmpFile);
                    @unlink($tmpFile);
                    if ($bytes !== false && $bytes !== '') {
                        return $bytes;
                    }
                }
                @unlink($tmpFile);
            }
        }

        // Pure-PHP ZIP (STORE method) fallback when ext-zip is not installed
        $localHeaders = '';
        $centralDir = '';
        $offset = 0;
        $count = 0;

        foreach ($entries as $name => $data) {
            $nameLen = strlen($name);
            $dataLen = strlen($data);
            $crc = crc32($data);

            // Local file header (signature 0x04034b50)
            $localHeader = pack(
                'VvvvvvVVVvv',
                0x04034b50,
                20, // version needed
                0,  // flags
                0,  // compression method: 0 (stored)
                0,  // mod time
                0,  // mod date
                $crc,
                $dataLen,
                $dataLen,
                $nameLen,
                0   // extra field length
            ) . $name;

            // Central directory file header (signature 0x02014b50)
            $centralHeader = pack(
                'VvvvvvvVVVvvvvvVV',
                0x02014b50,
                20, // version made by
                20, // version needed
                0,  // flags
                0,  // compression method: 0 (stored)
                0,  // mod time
                0,  // mod date
                $crc,
                $dataLen,
                $dataLen,
                $nameLen,
                0,  // extra field length
                0,  // comment length
                0,  // disk number start
                0,  // internal file attributes
                0,  // external file attributes
                $offset
            ) . $name;

            $localHeaders .= $localHeader . $data;
            $centralDir .= $centralHeader;
            $offset += strlen($localHeader) + $dataLen;
            $count++;
        }

        $eocd = pack(
            'VvvvvVVv',
            0x06054b50,
            0,
            0,
            $count,
            $count,
            strlen($centralDir),
            $offset,
            0
        );

        return $localHeaders . $centralDir . $eocd;
    }

    private function buildBlankDocx(): string {
        return $this->buildZipFromEntries([
            '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                . '<Default Extension="xml" ContentType="application/xml"/>'
                . '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                . '</Types>',
            '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                . '</Relationships>',
            'word/_rels/document.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
            'word/document.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                . '<w:body>'
                . '<w:p><w:r><w:t></w:t></w:r></w:p>'
                . '<w:sectPr>'
                . '<w:pgSz w:w="11906" w:h="16838"/>'
                . '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>'
                . '</w:sectPr>'
                . '</w:body>'
                . '</w:document>',
        ]);
    }

    private function buildBlankXlsx(): string {
        return $this->buildZipFromEntries([
            '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                . '<Default Extension="xml" ContentType="application/xml"/>'
                . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                . '</Types>',
            '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                . '</Relationships>',
            'xl/_rels/workbook.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
                . '</Relationships>',
            'xl/workbook.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                . 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                . '<sheets><sheet name="Planilha1" sheetId="1" r:id="rId1"/></sheets>'
                . '</workbook>',
            'xl/worksheets/sheet1.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                . '<sheetData/>'
                . '</worksheet>',
        ]);
    }

    private function buildBlankPptx(): string {
        return $this->buildZipFromEntries([
            '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                . '<Default Extension="xml" ContentType="application/xml"/>'
                . '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
                . '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
                . '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
                . '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
                . '</Types>',
            '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
                . '</Relationships>',
            'ppt/_rels/presentation.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
                . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>'
                . '</Relationships>',
            'ppt/presentation.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                . 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
                . 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
                . '<p:slideMasterIdLst><p:slideMasterId id="2147483648" r:id="rId1"/></p:slideMasterIdLst>'
                . '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>'
                . '<p:sldSz cx="12192000" cy="6858000"/>'
                . '<p:notesSz cx="6858000" cy="9144000"/>'
                . '</p:presentation>',
            'ppt/slideMasters/_rels/slideMaster1.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
                . '</Relationships>',
            'ppt/slideMasters/slideMaster1.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                . 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
                . 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
                . '<p:cSld><p:spTree>'
                . '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
                . '<p:grpSpPr/>'
                . '</p:spTree></p:cSld>'
                . '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
                . '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
                . '</p:sldMaster>',
            'ppt/slideLayouts/_rels/slideLayout1.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
                . '</Relationships>',
            'ppt/slideLayouts/slideLayout1.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                . 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
                . 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">'
                . '<p:cSld name="Blank"><p:spTree>'
                . '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
                . '<p:grpSpPr/>'
                . '</p:spTree></p:cSld>'
                . '</p:sldLayout>',
            'ppt/slides/_rels/slide1.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
                . '</Relationships>',
            'ppt/slides/slide1.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
                . 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
                . 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
                . '<p:cSld><p:spTree>'
                . '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
                . '<p:grpSpPr/>'
                . '</p:spTree></p:cSld>'
                . '</p:sld>',
        ]);
    }
}
