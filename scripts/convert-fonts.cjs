// Script pentru convertirea fonturilor TTF în base64 pentru jsPDF
const fs = require('fs');
const path = require('path');

console.log('🔄 Convertire fonturi DejaVu în base64...\n');

// Citește fonturile
const dejaVuNormal = fs.readFileSync(path.join(__dirname, '../public/fonts/DejaVuSans.ttf'));
const dejaVuBold = fs.readFileSync(path.join(__dirname, '../public/fonts/DejaVuSans-Bold.ttf'));

// Convertește în base64
const dejaVuNormalBase64 = dejaVuNormal.toString('base64');
const dejaVuBoldBase64 = dejaVuBold.toString('base64');

console.log(`✅ DejaVuSans.ttf: ${Math.round(dejaVuNormalBase64.length / 1024)} KB (base64)`);
console.log(`✅ DejaVuSans-Bold.ttf: ${Math.round(dejaVuBoldBase64.length / 1024)} KB (base64)\n`);

// Creează fișierul TypeScript cu fonturile
const tsContent = `// Fonturi DejaVu Sans pentru jsPDF - suport complet diacritice românești
// Auto-generat din scripts/convert-fonts.js

export const DejaVuSansNormal = "${dejaVuNormalBase64}";
export const DejaVuSansBold = "${dejaVuBoldBase64}";
`;

// Salvează fișierul
const outputPath = path.join(__dirname, '../src/utils/dejavu-fonts.ts');
fs.writeFileSync(outputPath, tsContent);

console.log(`📄 Fișier generat: src/utils/dejavu-fonts.ts`);
console.log(`📦 Dimensiune totală: ${Math.round((dejaVuNormalBase64.length + dejaVuBoldBase64.length) / 1024)} KB\n`);
console.log('✅ Conversie finalizată cu succes!');
