import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Google Vision API response types
 */
interface VisionAnnotation {
  textAnnotations?: Array<{
    description?: string;
    boundingPoly?: any;
  }>;
  fullTextAnnotation?: {
    text?: string;
  };
}

interface VisionResponse {
  responses: Array<{
    textAnnotations?: VisionAnnotation['textAnnotations'];
    fullTextAnnotation?: VisionAnnotation['fullTextAnnotation'];
    error?: {
      code: number;
      message: string;
    };
  }>;
}

/**
 * Options for text extraction
 */
export interface ExtractTextOptions {
  /** Maximum number of retries on failure */
  maxRetries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Whether to use full text annotation (more accurate but slower) */
  useFullTextAnnotation?: boolean;
}

/**
 * Google Vision Service
 * Provides reusable functions for extracting text from images using Google Vision API
 */
@Injectable()
export class VisionService {
  private readonly apiKey: string;
  private readonly visionApiUrl = 'https://vision.googleapis.com/v1/images:annotate';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_VISION_API_KEY');
    if (!this.apiKey) {
      console.warn('GOOGLE_VISION_API_KEY not configured. Vision features will be disabled.');
    }
  }

  /**
   * Check if Vision API is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Download file from URL and return as Buffer
   * @param fileUrl - URL of the file to download
   * @returns Buffer containing file data
   */
  private async downloadFile(fileUrl: string): Promise<Buffer> {
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new HttpException(
          `Failed to download file: ${response.statusText}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to download file: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Extract images from PDF buffer using pdf-lib
   * Note: This is a basic implementation that extracts embedded images.
   * It may not catch all visual elements rendered as vectors.
   */
  private async extractImagesFromPdf(pdfBuffer: Buffer): Promise<string[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFDocument, PDFName, PDFRawStream } = require('pdf-lib');
      
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const { context } = pdfDoc;
      const imagesBase64: string[] = [];

      // Iterate over all indirect objects to find images
      // Note: enumerateIndirectObjects returns a Map-like iterator
      const indirectObjects = context.enumerateIndirectObjects();
      
      for (const [ref, obj] of indirectObjects) {
        // We are looking for PDFRawStream which are images
        if (obj instanceof PDFRawStream) {
           const dict = obj.dict;
           const type = dict.lookup(PDFName.of('Type'));
           const subtype = dict.lookup(PDFName.of('Subtype'));
           
           if (type === PDFName.of('XObject') && subtype === PDFName.of('Image')) {
             const filter = dict.lookup(PDFName.of('Filter'));
             console.log(`DEBUG: Found Image XObject. Filter: ${filter?.toString()}`);
             
             // Check if filter is DCTDecode (JPEG) or JPXDecode (JPEG2000)
             // Filter can be a Name or an Array of Names
             let isJpeg = false;
             let needsInflate = false;
             
             // Helper to check if a filter item is JPEG-like
             const isJpegFilter = (f: any) => 
               f === PDFName.of('DCTDecode') || f === PDFName.of('JPXDecode');

             if (filter instanceof PDFName) {
               isJpeg = isJpegFilter(filter);
             } else if (filter instanceof require('pdf-lib').PDFArray) {
               const array = filter as any;
               // Check for chained filters. 
               // Common case: [ /FlateDecode /DCTDecode ] -> This means the JPEG data is Zlib compressed.
               // We need to check if DCTDecode is present, and if FlateDecode is also present.
               
               let hasJpeg = false;
               let hasFlate = false;
               
               for (let i = 0; i < array.size(); i++) {
                 const f = array.get(i);
                 if (isJpegFilter(f)) hasJpeg = true;
                 if (f === PDFName.of('FlateDecode')) hasFlate = true;
               }
               
               if (hasJpeg) {
                 isJpeg = true;
                 // If FlateDecode is present, we likely need to inflate.
                 // However, the order matters. Usually filters are applied in order of encoding.
                 // So decoding should be reverse.
                 // If filter is [ /FlateDecode /DCTDecode ], it means:
                 // Encoded = Flate(DCT(RawImage))
                 // So we need to Inflate first to get the DCT (JPEG) data.
                 if (hasFlate) needsInflate = true;
               }
             }

             if (isJpeg) {
               let data = obj.getContents();
               
               if (needsInflate) {
                 try {
                   // eslint-disable-next-line @typescript-eslint/no-require-imports
                   const zlib = require('zlib');
                   data = zlib.unzipSync(Buffer.from(data));
                   console.log('DEBUG: Inflated data for JPEG extraction.');
                 } catch (inflateError) {
                   console.error('DEBUG: Failed to inflate data:', inflateError);
                   // Continue with original data, might fail but worth a try
                 }
               }
               
               imagesBase64.push(Buffer.from(data).toString('base64'));
               console.log('DEBUG: Extracted JPEG/JPX image.');
             } else {
               console.log('DEBUG: Image is not JPEG/JPX (likely PNG/FlateDecode). Skipping for now as conversion is required.');
             }
           }
        }
      }
      
      if (imagesBase64.length === 0) {
        console.log('No JPEG images found in PDF for fallback extraction.');
      } else {
        console.log(`Found ${imagesBase64.length} JPEG images in PDF for fallback extraction.`);
      }
      
      return imagesBase64;
    } catch (error) {
      console.error('Failed to extract images from PDF:', error);
      return [];
    }
  }

  /**
   * Download image from URL and convert to base64
   * @param imageUrl - URL of the image to download
   * @returns Base64 encoded image string
   */
  private async downloadImageAsBase64(imageUrl: string): Promise<string> {
    const buffer = await this.downloadFile(imageUrl);
    return buffer.toString('base64');
  }

  /**
   * Extract text from PDF using pdf-parse library
   * Note: Google Vision API doesn't support PDFs directly, so we use pdf-parse
   * @param pdfUrl - URL of the PDF to process
   * @param options - Extraction options (retry logic)
   * @returns Extracted text content
   */
  async extractTextFromPdf(
    pdfUrl: string,
    options: ExtractTextOptions = {},
  ): Promise<string> {
    const {
      maxRetries = this.maxRetries,
      retryDelay = this.retryDelay,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Use require for pdf-parse (v1.1.1 has function-based API)
        let pdfParseFn: any;
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          pdfParseFn = require('pdf-parse');
          
          // Verify it's a function
          if (typeof pdfParseFn !== 'function') {
            // Try to get default export if available
            if (pdfParseFn && typeof pdfParseFn.default === 'function') {
              pdfParseFn = pdfParseFn.default;
            } else {
              throw new Error(`pdf-parse is not a function. Got type: ${typeof pdfParseFn}`);
            }
          }
        } catch (requireError: any) {
          if (requireError.code === 'MODULE_NOT_FOUND' || requireError.message?.includes('Cannot find module')) {
            throw new HttpException(
              'PDF extraction is not available. Please install pdf-parse: pnpm add pdf-parse@1.1.1',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }
          throw new HttpException(
            `PDF extraction error: ${requireError.message || 'Unknown error'}`,
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        // Download PDF file
        const pdfBuffer = await this.downloadFile(pdfUrl);

        // Extract text using pdf-parse
        const pdfData = await pdfParseFn(pdfBuffer);
        const extractedText = pdfData.text.trim();
        console.log(`DEBUG: Extracted text: "${extractedText}", Length: ${extractedText.length}`);

        // Check if text is sufficient, otherwise fallback to OCR
      if (extractedText.length < 50) {
          console.log(`PDF text extraction yielded only ${extractedText.length} characters. Falling back to OCR.`);
          try {
             const imagesBase64 = await this.extractImagesFromPdf(pdfBuffer);
             if (imagesBase64.length > 0) {
               const ocrResults = await Promise.all(
                 imagesBase64.map(base64 => this.extractTextFromImageBase64(base64, options))
               );
               const ocrText = ocrResults.filter(t => t.trim().length > 0).join('\n\n');
               if (ocrText.length > extractedText.length) {
                 return ocrText;
               }
             }
          } catch (ocrError) {
            console.error('Failed to perform OCR fallback for PDF:', ocrError);
            // Continue with original text if OCR fails
          }
      }

        // Return extracted text
        return extractedText;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx) or service unavailable
        if (error instanceof HttpException && (error.getStatus() < 500 || error.getStatus() === 503)) {
          throw error;
        }

        // Wait before retrying (except on last attempt)
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }

    throw new HttpException(
      `Failed to extract text from PDF after ${maxRetries + 1} attempts: ${lastError?.message}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Extract text from a single image URL
   * @param imageUrl - URL of the image to process
   * @param options - Extraction options
   * @returns Extracted text content
   */
  /**
   * Extract text from a base64 image
   */
  async extractTextFromImageBase64(
    imageBase64: string,
    options: ExtractTextOptions = {},
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new HttpException(
        'Google Vision API is not configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const {
      maxRetries = this.maxRetries,
      retryDelay = this.retryDelay,
      useFullTextAnnotation = true,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Prepare request body
        const requestBody = {
          requests: [
            {
              image: {
                content: imageBase64,
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                  maxResults: 1,
                },
              ],
            },
          ],
        };

        // Call Google Vision API
        const response = await fetch(
          `${this.visionApiUrl}?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new HttpException(
            `Google Vision API error: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`,
            HttpStatus.BAD_GATEWAY,
          );
        }

        const data: VisionResponse = await response.json();

        if (!data.responses || data.responses.length === 0) {
          throw new HttpException(
            'Invalid response from Google Vision API',
            HttpStatus.BAD_GATEWAY,
          );
        }

        const visionResponse = data.responses[0];

        // Check for API errors
        if (visionResponse.error) {
          throw new HttpException(
            `Google Vision API error: ${visionResponse.error.message}`,
            HttpStatus.BAD_GATEWAY,
          );
        }

        // Extract text based on annotation type
        let extractedText = '';

        if (useFullTextAnnotation && visionResponse.fullTextAnnotation?.text) {
          extractedText = visionResponse.fullTextAnnotation.text;
        } else if (visionResponse.textAnnotations && visionResponse.textAnnotations.length > 0) {
          // First annotation contains the full text
          extractedText = visionResponse.textAnnotations[0].description || '';
        }

        return extractedText.trim();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (error instanceof HttpException && error.getStatus() < 500) {
          throw error;
        }

        // Wait before retrying (except on last attempt)
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }

    throw new HttpException(
      `Failed to extract text after ${maxRetries + 1} attempts: ${lastError?.message}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Extract text from a single image URL
   * @param imageUrl - URL of the image to process
   * @param options - Extraction options
   * @returns Extracted text content
   */
  async extractTextFromImage(
    imageUrl: string,
    options: ExtractTextOptions = {},
  ): Promise<string> {
    const imageBase64 = await this.downloadImageAsBase64(imageUrl);
    return this.extractTextFromImageBase64(imageBase64, options);
  }

  /**
   * Extract text from multiple image URLs in parallel
   * @param imageUrls - Array of image URLs to process
   * @param options - Extraction options
   * @returns Array of extracted text content (order matches input URLs)
   */
  async extractTextFromImages(
    imageUrls: string[],
    options: ExtractTextOptions = {},
  ): Promise<string[]> {
    if (!imageUrls || imageUrls.length === 0) {
      return [];
    }

    // Process images in parallel with error handling
    const extractionPromises = imageUrls.map(async (url, index) => {
      try {
        return await this.extractTextFromImage(url, options);
      } catch (error) {
        // Log error but don't fail entire batch
        console.error(`Failed to extract text from image ${index + 1} (${url}):`, error);
        return ''; // Return empty string for failed extractions
      }
    });

    return Promise.all(extractionPromises);
  }

  /**
   * Extract text from images and filter out empty results
   * @param imageUrls - Array of image URLs to process
   * @param options - Extraction options
   * @returns Array of non-empty extracted text content
   */
  async extractTextFromImagesFiltered(
    imageUrls: string[],
    options: ExtractTextOptions = {},
  ): Promise<string[]> {
    const results = await this.extractTextFromImages(imageUrls, options);
    return results.filter((text) => text.trim().length > 0);
  }

  /**
   * Extract text from multiple PDF URLs in parallel
   * @param pdfUrls - Array of PDF URLs to process
   * @param options - Extraction options
   * @returns Array of extracted text content (order matches input URLs)
   */
  async extractTextFromPdfs(
    pdfUrls: string[],
    options: ExtractTextOptions = {},
  ): Promise<string[]> {
    if (!pdfUrls || pdfUrls.length === 0) {
      return [];
    }

    // Process PDFs in parallel with error handling
    const extractionPromises = pdfUrls.map(async (url, index) => {
      try {
        return await this.extractTextFromPdf(url, options);
      } catch (error) {
        // Log error but don't fail entire batch
        console.error(`Failed to extract text from PDF ${index + 1} (${url}):`, error);
        return ''; // Return empty string for failed extractions
      }
    });

    return Promise.all(extractionPromises);
  }

  /**
   * Extract text from mixed file types (images and PDFs)
   * @param fileUrls - Array of file URLs to process
   * @param options - Extraction options
   * @returns Array of extracted text content (order matches input URLs)
   */
  async extractTextFromFiles(
    fileUrls: string[],
    options: ExtractTextOptions = {},
  ): Promise<string[]> {
    if (!fileUrls || fileUrls.length === 0) {
      return [];
    }

    // Separate images and PDFs
    const imageUrls: string[] = [];
    const pdfUrls: string[] = [];

    fileUrls.forEach((url) => {
      const extension = url.split('.').pop()?.toLowerCase() || '';
      const isPdf = extension === 'pdf' || url.toLowerCase().includes('.pdf');
      
      if (isPdf) {
        pdfUrls.push(url);
      } else {
        imageUrls.push(url);
      }
    });

    // Process images and PDFs in parallel
    const [imageResults, pdfResults] = await Promise.all([
      imageUrls.length > 0 ? this.extractTextFromImages(imageUrls, options) : Promise.resolve([]),
      pdfUrls.length > 0 ? this.extractTextFromPdfs(pdfUrls, options) : Promise.resolve([]),
    ]);

    // Reconstruct results in original order
    const results: string[] = [];
    let imageIndex = 0;
    let pdfIndex = 0;

    fileUrls.forEach((url) => {
      const extension = url.split('.').pop()?.toLowerCase() || '';
      const isPdf = extension === 'pdf' || url.toLowerCase().includes('.pdf');
      
      if (isPdf) {
        results.push(pdfResults[pdfIndex++] || '');
      } else {
        results.push(imageResults[imageIndex++] || '');
      }
    });

    return results;
  }

  /**
   * Extract text from mixed file types and filter out empty results
   * @param fileUrls - Array of file URLs to process
   * @param options - Extraction options
   * @returns Array of non-empty extracted text content
   */
  async extractTextFromFilesFiltered(
    fileUrls: string[],
    options: ExtractTextOptions = {},
  ): Promise<string[]> {
    const results = await this.extractTextFromFiles(fileUrls, options);
    return results.filter((text) => text.trim().length > 0);
  }
}

