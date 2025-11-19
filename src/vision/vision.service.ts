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

        // Return extracted text
        return pdfData.text.trim();
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
  async extractTextFromImage(
    imageUrl: string,
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
        // Download and convert image to base64
        const imageBase64 = await this.downloadImageAsBase64(imageUrl);

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

