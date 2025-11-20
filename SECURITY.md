# Security Policy - CARapp Petroșani v2

**Last Updated:** 2025-11-20
**Version:** 1.0.2

---

## Security Architecture

CARapp Petroșani is a **client-side only Progressive Web Application (PWA)** with the following security characteristics:

- ✅ **Zero Backend:** All data processing happens in the browser via WebAssembly (sql.js)
- ✅ **Zero Network Transmission:** User data never leaves the device
- ✅ **Zero External Input:** Only user-owned SQLite databases are processed
- ✅ **Write-Only Dependencies:** Production dependencies are used in write-only or read-only modes
- ✅ **Zero Production Vulnerabilities:** All high/critical vulnerabilities eliminated

---

## Current Security Status

### ✅ **ZERO VULNERABILITIES** (as of 2025-11-20)

```bash
npm audit
# found 0 vulnerabilities
```

All previously reported vulnerabilities have been **eliminated** through migration from `xlsx` to `ExcelJS`.

---

## Recent Security Improvements (2025-11-20)

### Migration: xlsx 0.18.5 → ExcelJS 4.4.0

**Previous Vulnerabilities (RESOLVED):**

#### 1. ~~xlsx - Prototype Pollution (High)~~ - **ELIMINATED** ✅

**Vulnerability:** [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
**Severity:** High
**Status:** ✅ **ELIMINATED** by removing `xlsx` dependency
**Action Taken:** Migrated to ExcelJS 4.4.0 (MIT License, actively maintained, zero vulnerabilities)

#### 2. ~~xlsx - Regular Expression Denial of Service (ReDoS)~~ - **ELIMINATED** ✅

**Vulnerability:** [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)
**Severity:** High
**Status:** ✅ **ELIMINATED** by removing `xlsx` dependency
**Action Taken:** Migrated to ExcelJS 4.4.0

### New Excel Export Library: ExcelJS 4.4.0

**Security Benefits:**
- ✅ **Zero known vulnerabilities** (actively maintained)
- ✅ **MIT License** (open source, no licensing concerns)
- ✅ **Write-only usage** in CARapp (same security model as xlsx)
- ✅ **Regular updates** from maintainers
- ✅ **TypeScript native** (better type safety)

**Usage Pattern (Write-Only):**

```typescript
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// Write-only operations:
const workbook = new ExcelJS.Workbook();           // ✅ Safe - write only
const worksheet = workbook.addWorksheet('Sheet1'); // ✅ Safe - write only
worksheet.addRow({ col1: 'value', col2: 123 });    // ✅ Safe - write only
const buffer = await workbook.xlsx.writeBuffer();  // ✅ Safe - write only
saveAs(new Blob([buffer]), 'file.xlsx');           // ✅ Safe - write only
```

**We NEVER:**
- ❌ Parse user-uploaded `.xlsx` files
- ❌ Use `workbook.xlsx.readFile()` or `workbook.xlsx.load()`
- ❌ Accept external `.xlsx` input

---

### 3. ✅ glob - Command Injection (High, Development) - **FIXED**

**Vulnerability:** [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2)
**Severity:** High
**Status:** ✅ Fixed via `npm audit fix`
**Risk in CARapp:** **LOW** (development dependency only)

**Why LOW Risk:**

- `glob` is a **development dependency** (via `tailwindcss` and `workbox-build`)
- Does NOT ship to production bundle
- Vulnerability requires CLI execution with malicious input
- Only affects local development environment

**Fix Applied:** Upgrade to patched version via `npm audit fix`.

---

### 4. ✅ js-yaml - Prototype Pollution (Moderate, Development) - **FIXED**

**Vulnerability:** [GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m)
**Severity:** Moderate
**Status:** ✅ Fixed via `npm audit fix`
**Risk in CARapp:** **LOW** (development dependency only)

**Why LOW Risk:**

- `js-yaml` is a **development dependency** (via `@eslint/eslintrc`)
- Does NOT ship to production bundle
- Only used during build/lint process
- No user input processed by `js-yaml`

**Fix Applied:** Upgrade to patched version via `npm audit fix`.

---

## Vulnerability Summary

| Package | Severity | Type | Status | Real Risk |
|---------|----------|------|--------|-----------|
| **xlsx** | High | Prototype Pollution | ⚠️ No fix | ✅ ZERO (write-only) |
| **xlsx** | High | ReDoS | ⚠️ No fix | ✅ ZERO (write-only) |
| **glob** | High | Command Injection | ✅ Fixed | 🟡 LOW (dev-only) |
| **js-yaml** | Moderate | Prototype Pollution | ✅ Fixed | 🟡 LOW (dev-only) |

---

## Security Best Practices Implemented

### Client-Side Security
- ✅ **No eval() or Function() constructors**
- ✅ **Content Security Policy (CSP) ready**
- ✅ **Sanitized user input** (React auto-escaping)
- ✅ **Decimal.js** for financial precision (no floating-point vulnerabilities)

### Data Privacy
- ✅ **Zero data transmission** to external servers
- ✅ **IndexedDB** with same-origin policy
- ✅ **File System Access API** with explicit user consent
- ✅ **No analytics or tracking**

### Dependency Management
- ✅ **Lock file** (`package-lock.json`) committed
- ✅ **Regular audits** via `npm audit`
- ✅ **Minimal dependencies** (18,000 lines of TypeScript, ~30 dependencies)

---

## Reporting Security Issues

If you discover a security vulnerability in CARapp Petroșani, please report it to:

- **GitHub Issues:** https://github.com/totilaAtila/carapp2/issues
- **Email:** [Contact repository owner]

**Please DO NOT** disclose security vulnerabilities publicly until they have been addressed.

---

## Security Roadmap

### Planned Improvements
- [ ] Implement Content Security Policy (CSP) headers
- [ ] Add Subresource Integrity (SRI) for CDN resources
- [ ] Evaluate alternative to `xlsx` library (if better options emerge)
- [ ] Automated Dependabot alerts integration

### Monitoring
- ⏱️ **Weekly** npm audit checks
- ⏱️ **Monthly** dependency updates review
- ⏱️ **Quarterly** security architecture review

---

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [npm Security Best Practices](https://docs.npmjs.com/packages-and-modules/securing-your-code)

---

**Note:** This document is maintained alongside the codebase and should be updated whenever security-relevant changes are made.
