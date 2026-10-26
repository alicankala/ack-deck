declare module "mammoth" {
  export interface MammothOptions {
    arrayBuffer: ArrayBuffer;
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
  }

  export interface ConversionResult {
    value: string;
    messages: Array<{
      type: "warning" | "error";
      message: string;
    }>;
  }

  export function convertToHtml(input: MammothOptions): Promise<ConversionResult>;
  export function convertToMarkdown(input: MammothOptions): Promise<ConversionResult>;
  export function extractRawText(input: MammothOptions): Promise<ConversionResult>;
}
