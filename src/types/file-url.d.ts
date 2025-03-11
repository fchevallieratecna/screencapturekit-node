declare module 'file-url' {
  /**
   * Convert a path to a file URL.
   * @param {string} filePath - Path to convert to file URL.
   * @returns {string} A properly formatted file URL.
   */
  function fileUrl(filePath: string): string;
  
  export default fileUrl;
} 