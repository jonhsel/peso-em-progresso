/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
    // No Next 14.x essa chave só é lida dentro de `experimental` — no nível raiz
    // (como documentado para Next 15+) é silenciosamente ignorada, com um aviso
    // "Unrecognized key(s)" no log de build, e os arquivos de fonte do pdfkit
    // continuam de fora do trace da função serverless (o 500 volta a acontecer).
    outputFileTracingIncludes: {
      "/api/export/pdf": [
        "./node_modules/@react-pdf/renderer/**/*",
        "./node_modules/@react-pdf/pdfkit/**/*",
        "./node_modules/@react-pdf/layout/**/*",
        "./node_modules/@react-pdf/font/**/*",
        "./node_modules/pdfkit/**/*",
      ],
    },
  },
};

module.exports = nextConfig;
