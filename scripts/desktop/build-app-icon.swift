import AppKit
import Foundation

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
let assets = root.appendingPathComponent("assets/branding")
guard let artwork = NSImage(contentsOf: assets.appendingPathComponent("opl-studio-artwork.png")),
      let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024,
                                    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                    isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
      let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Unable to load application icon artwork")
}
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: 1024, height: 1024).fill(using: .copy)
// macOS does not mask ICNS images. Keep the canvas transparent outside the tile.
let tile = NSRect(x: 100, y: 100, width: 824, height: 824)
NSBezierPath(roundedRect: tile, xRadius: 184, yRadius: 184).addClip()
let sourceTile = NSRect(x: 40, y: 40, width: artwork.size.width - 80, height: artwork.size.height - 80)
artwork.draw(in: tile, from: sourceTile, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Unable to encode application icon")
}
try png.write(to: assets.appendingPathComponent("opl-studio.png"))

for (x, y) in [(0, 0), (1023, 0), (0, 1023), (1023, 1023), (512, 0), (100, 100)] {
    precondition(bitmap.colorAt(x: x, y: y)!.alphaComponent == 0, "Icon canvas must be transparent")
}
precondition(bitmap.colorAt(x: 512, y: 512)!.alphaComponent == 1, "Icon artwork must remain opaque")

let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("opl-icon-\(UUID().uuidString)")
let iconset = temporary.appendingPathComponent("opl-studio.iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: temporary) }
func run(_ command: String, _ arguments: [String]) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: command)
    process.arguments = arguments
    process.standardOutput = FileHandle.nullDevice
    try process.run()
    process.waitUntilExit()
    precondition(process.terminationStatus == 0, "Icon conversion failed: \(command)")
}
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let name = "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
        try run("/usr/bin/sips", ["-z", String(size * scale), String(size * scale),
                                 assets.appendingPathComponent("opl-studio.png").path,
                                 "--out", iconset.appendingPathComponent(name).path])
    }
}
try run("/usr/bin/iconutil", ["-c", "icns", iconset.path, "-o", assets.appendingPathComponent("opl-studio.icns").path])
print("Built 1024px RGBA application icon and all macOS ICNS sizes with transparent margins.")
