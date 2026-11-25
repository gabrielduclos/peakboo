# Photo capture

Native JPEG capture is prepared before preview, reading headers and resizing to at most 1600 px on the longest edge. The bitmap is closed before encoding and the canvas is released. Uploads remain capped at 10 MB; source JPEGs up to 50 MB can be prepared. Document uploads preserve the original. Other formats depend on browser support. If the Android camera fails before returning a file to the PWA, this change cannot fix the native camera app: verify on a real device.

[Português](camera-memory.pt.md)
