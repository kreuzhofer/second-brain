---
inclusion: always
---

# Spec Naming: `NNN-kebab-name`

Pattern: Three-digit prefix + kebab-case name (e.g., `027-mobile-dashboard`)

**Find next number:**
```bash
ls -1 .kiro/specs/ | grep -E '^[0-9]{3}-' | sort | tail -1
```

**Rules:**
- ✅ Always use the next number after the highest existing spec (e.g., if 027 exists, use 028)
- ✅ Three digits with leading zeros (001, 027, 100)
- ✅ Kebab-case descriptive name
- ❌ Never reuse an existing number, even if the folder is empty
- ❌ Never use a number lower than or equal to the highest existing spec
