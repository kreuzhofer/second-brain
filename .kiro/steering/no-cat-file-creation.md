# No File Creation via Cat/Echo Commands

## Rule

**NEVER** use `cat`, `echo`, or any shell redirection (`>`, `>>`) to create or modify files.

## Reason

Using shell commands like `cat > file` or `echo "content" > file` causes PTY disconnection errors and terminal failures.

## What to Use Instead

- Use `fsWrite` tool to create files
- Use `fsAppend` tool to append content to existing files
- Use `strReplace` tool to modify existing file content

## Examples

❌ **FORBIDDEN:**
```bash
cat > file.ts << 'EOF'
content
EOF
```

❌ **FORBIDDEN:**
```bash
echo 'content' > file.ts
```

❌ **FORBIDDEN:**
```bash
printf 'content' > file.ts
```

✅ **CORRECT:**
Use the `fsWrite` tool with path and text parameters.
