# Security Policy - CARapp Petroșani v2

**Last Updated:** 2025-11-19
**Version:** 1.0.1

---

## Security Architecture

CARapp Petroșani is a **client-side only Progressive Web Application (PWA)** with the following security characteristics:

- ✅ **Zero Backend:** All data processing happens in the browser via WebAssembly (sql.js)
- ✅ **Zero Network Transmission:** User data never leaves the device
- ✅ **Zero External Input:** Only user-owned SQLite databases are processed
- ✅ **Read-Only Dependencies:** Production dependencies are used in write-only or read-only modes

---

## Current Vulnerabilities Analysis

### 1. ❌ xlsx - Prototype Pollution (High) - **NOT APPLICABLE**

**Vulnerability:** [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
**Severity:** High
**Status:** ⚠️ No fix available (as of 2025-11-19)
**Risk in CARapp:** **ZERO** ✅

**Why NOT Applicable:**

The vulnerability affects **parsing** of malicious `.xlsx` files. CARapp uses `xlsx` **ONLY for exporting** data (write-only operations):

```typescript
// ONLY USAGE in codebase:
import * as XLSX from 'xlsx';

// Write-only operations:
const ws = XLSX.utils.aoa_to_sheet(data);      // ✅ Safe - write only
const wb = XLSX.utils.book_new();               // ✅ Safe - write only
XLSX.utils.book_append_sheet(wb, ws, "Sheet1"); // ✅ Safe - write only
XLSX.writeFile(wb, "raport.xlsx");              // ✅ Safe - write only
```

**We NEVER:**
- ❌ Parse user-uploaded `.xlsx` files
- ❌ Use `XLSX.read()` or `XLSX.readFile()`
- ❌ Accept external `.xlsx` input

**Conclusion:** The prototype pollution attack vector (malicious `.xlsx` files) cannot be exploited because we only **generate** Excel files, never parse them.

**Mitigation:** Document usage pattern. Monitor for future `xlsx` updates.

---

### 2. ❌ xlsx - Regular Expression Denial of Service (ReDoS) (High) - **NOT APPLICABLE**

**Vulnerability:** [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)
**Severity:** High
**Status:** ⚠️ No fix available (as of 2025-11-19)
**Risk in CARapp:** **ZERO** ✅

**Why NOT Applicable:**

Same reasoning as #1 - ReDoS affects **parsing** of malicious input. CARapp uses `xlsx` in **write-only mode**.

**Conclusion:** Attack vector (malicious regex input) cannot be exploited in write-only usage.

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
