const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) walk(fullPath, files);
    else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) files.push(fullPath);
  });
  return files;
}

const files = walk(path.join(__dirname, 'app'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // For API Routes (Server Side)
  content = content.replace(
    /searchParams\.get\('company'\)\s*\|\|\s*'comp_uabiotech'/g, 
    "searchParams.get('company') || request?.cookies?.get('active_company')?.value || 'comp_uabiotech'"
  );

  content = content.replace(
    /body\.company_id\s*\|\|\s*'comp_uabiotech'/g, 
    "body.company_id || request?.cookies?.get('active_company')?.value || 'comp_uabiotech'"
  );

  // For Frontend Fetches (Client Side) - dynamically injecting localStorage 
  // We'll replace instances of "company=comp_uabiotech" inside template literals
  // First, convert static quotes like fetch('/api/foo?company=comp_uabiotech') to template literals
  content = content.replace(
    /'(\/api\/[^']+company=)comp_uabiotech([^']*)'/g,
    "`$1${localStorage.getItem('active_company') || 'comp_uabiotech'}$2`"
  );

  // Then for existing template literals fetch(`/api/foo?company=comp_uabiotech&m=${x}`)
  content = content.replace(
    /company=comp_uabiotech/g,
    "company=${localStorage.getItem('active_company') || 'comp_uabiotech'}"
  );

  // Fix JSON request bodies in Client components
  content = content.replace(
    /company_id:\s*'comp_uabiotech'/g,
    "company_id: localStorage.getItem('active_company') || 'comp_uabiotech'"
  );

  // Handle URLSearchParams in Audit logs
  content = content.replace(
    /company:\s*'comp_uabiotech'/g,
    "company: localStorage.getItem('active_company') || 'comp_uabiotech'"
  );

  // Re-write file if modified
  if (original !== content) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated: ${file.replace(__dirname, '')}`);
  }
});
