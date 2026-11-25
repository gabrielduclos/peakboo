# Captura de fotos

A captura nativa de JPEG é preparada antes da prévia, com leitura dos cabeçalhos e redimensionamento para até 1600 px na maior dimensão. O bitmap é fechado antes da codificação e o canvas é liberado. O limite de envio continua em 10 MB; JPEGs originais de até 50 MB podem ser preparados. Arquivos enviados como documento mantêm o original. Outros formatos dependem do suporte do navegador. Se a câmera do Android falhar antes de entregar o arquivo ao PWA, esta alteração não corrige o aplicativo nativo: teste em dispositivo real.

[English](camera-memory.en.md)
