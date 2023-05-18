import TensorFlowLite
import Photos
import Foundation
import CoreImage

enum RecognizerError: Error {
  case CreateCGImageFailedError(String)
}

@objc
public class FaceRecognizerPlugin: FrameProcessorPlugin {
  
  override public func name() -> String! {
    return "recognizeFaces"
  }
  
  private static func toRGBArray(cgImage: CGImage) -> [Float32] {
    let width = cgImage.width
    let height = cgImage.height
    let componentsCount = 4
    let bitsPerPixel = cgImage.bitsPerPixel
    let bitsPerComponent = bitsPerPixel / componentsCount
    let dataSize = width * height * componentsCount
    var pixelData = [Float32](repeating: 0, count: dataSize)
    let colorSpace = CGColorSpaceCreateDeviceRGB()

    let context = CGContext(data: &pixelData,
                            width: width,
                            height: height,
                            bitsPerComponent: bitsPerComponent,
                            bytesPerRow: bitsPerPixel / 8 * width,
                            space: colorSpace,
                            bitmapInfo: cgImage.bitmapInfo.rawValue)
    context?.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))


    var rgbs = [Float32](repeating: 0, count: width * height * 3)
    for i in 0 ..< height {
      for j in 0 ..< width {
        let k = i * width + j
        rgbs[3 * k] = pixelData[4 * k]
        rgbs[3 * k + 1] = pixelData[4 * k + 1]
        rgbs[3 * k + 2] = pixelData[4 * k + 2]
      }
    }
    
    let size = Float(height * width)
    let mean = rgbs.reduce(0, +) / Float(rgbs.count)
    
    let std =
      max(
        sqrtf(
          rgbs.reduce(Float(0), {(accum, next) in
          accum + pow(next - mean, 2)
          }) / Float(rgbs.count)),
        1.0 / sqrtf(Float(rgbs.count)))
    
    for (i, x) in rgbs.enumerated() {
      rgbs[i] = (x - mean) / std
    }
    
    return rgbs
  }
  
  public override func callback(_ frame: Frame!, withArguments withArgs: [Any]!) -> Any! {
    let buffer = frame.buffer!
    
    let model = FaceNetModel.shared
    let inputImageSize = FaceNetModel.inputImageSize
//    let orientation = frame.orientation
    
    let imageBuffer = CMSampleBufferGetImageBuffer(buffer)!
    let imageHeight = CVPixelBufferGetHeight(imageBuffer)
    
    var results : [[Float32]?] = []
    
    if let arg0 = withArgs[0] as? [[String: Any]] {
      let ciImage = CIImage(cvImageBuffer: imageBuffer);
      
      for i in arg0 {
        do {
          let bounds = i["bounds"] as! [String: Any]
          let rollAngle = i["rollAngle"] as! Float;
          
          let height = bounds["height"] as! Int
          let top: Int = imageHeight - (bounds["top"] as! Int + height)
          let rect = CGRect(
            x: bounds["left"] as! Int,
            y: top,
            width: bounds["width"] as! Int,
            height: height)
          
          let filter: CIFilter = {
            let cropper = CIFilter(name: "CIPerspectiveCorrection")!
            
            let formatDescription = CMSampleBufferGetFormatDescription(buffer)!
            
            let dimensions = CMVideoFormatDescriptionGetDimensions(formatDescription)
            
            let width = CGFloat(dimensions.width)
            let height = CGFloat(dimensions.height)
            
            let center = CGPoint(x: (rect.minX + rect.maxX) / 2, y: (rect.minY + rect.maxY) / 2)
            
            let transformationMatrix = CGAffineTransform(translationX: -center.x, y: -center.y)
              .concatenating(CGAffineTransform(rotationAngle: CGFloat(rollAngle) / 180 * CGFloat.pi))
              .concatenating(CGAffineTransform(translationX: center.x, y: center.y))
            
//            TODO: 좀더 이해잘되게 리팩토링. 좌표계가 upsidedown이라서 헷갈림.
            let topLeft = CGPoint(x: rect.origin.x, y: rect.origin.y + rect.size.height)
            let topRight = CGPoint(x: rect.origin.x + rect.size.width, y: rect.origin.y + rect.size.height)
            let bottomLeft = rect.origin
            let bottomRight = CGPoint(x: rect.origin.x + rect.size.width, y:  rect.origin.y)
            
            cropper.setValue(ciImage, forKey: kCIInputImageKey)
            cropper.setValue(CIVector(cgPoint: topLeft.applying(transformationMatrix)), forKey: "inputTopLeft")
            cropper.setValue(CIVector(cgPoint: topRight.applying(transformationMatrix)), forKey: "inputTopRight")
            cropper.setValue(CIVector(cgPoint: bottomLeft.applying(transformationMatrix)), forKey: "inputBottomLeft")
            cropper.setValue(CIVector(cgPoint: bottomRight.applying(transformationMatrix)), forKey: "inputBottomRight")
            
            
            let resizer: CIFilter = {
              let f = CIFilter(name: "CILanczosScaleTransform")!
              f.setValue(cropper.outputImage, forKey: kCIInputImageKey)
              f.setValue(CGFloat(inputImageSize) / rect.width, forKey: kCIInputScaleKey)
              f.setValue(1.0, forKey: kCIInputAspectRatioKey)
              return f
            }()
            
            return resizer
          }()
          
          let croppedImage = filter.outputImage!
          
          let context = CIContext(options: nil)
          guard let cgImage = context.createCGImage(
            croppedImage,
            from: CGRect(origin: croppedImage.extent.origin, size: CGSize(width: inputImageSize, height: inputImageSize)),
            format: CIFormat.RGBAf,
            colorSpace: CGColorSpaceCreateDeviceRGB()) else {
            
            throw RecognizerError.CreateCGImageFailedError("\(bounds.description) \(croppedImage.extent)");
          }
          
        
          let inputBuffer = FaceRecognizerPlugin.toRGBArray(cgImage: cgImage)
          
          let input = Data(buffer: UnsafeBufferPointer<Float32>(start: inputBuffer, count: inputBuffer.count))
          try model.interpreter.copy(input, toInputAt: 0)
          
          try model.interpreter.invoke()
          
          let output = try model.interpreter.output(at: 0).data
          var outputBuffer = Array<Float32>(repeating: 0, count: 128)
          _ = outputBuffer.withUnsafeMutableBytes { output.copyBytes(to: $0) }
          results.append(outputBuffer)
          
        } catch{
          results.append(nil);
        }
      }
    }
    
    return results
  }
}

extension Array {
  func get (index: Index) -> Element? {
    0 <= index && index < count ? self[index] : nil
  }
}

class FaceNetModel {
  static let shared = FaceNetModel()
  
  static let inputImageSize = 160
  
  public let interpreter: Interpreter
  
  init() {
    let resourcePath = Bundle.main.resourcePath!
    let imgName = "facenet.tflite"
    let path = resourcePath + "/" + imgName
    let fileManager = FileManager.default
    
    var delegate: Delegate? = CoreMLDelegate()
    if delegate == nil {
      delegate = MetalDelegate()  // Add Metal delegate options if necessary.
    }
//    TODO: when delegat is nil
//    FIXME: no try!
    interpreter = try! Interpreter(modelPath: path, delegates: [delegate!])
  }
}
