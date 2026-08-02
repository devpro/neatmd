function getEditorConfigMaxLineLength() {
    const configPath = path.join(process.cwd(), '.editorconfig');
    if (!fs.existsSync(configPath)) {
        console.warn('No .editorconfig found, defaulting to 240');
        return 240;
    }

    const content = fs.readFileSync(configPath, 'utf8');
    let inMdSection = false;
    let maxLength = 240;

    for (let line of content.split(/\r?\n/)) {
        line = line.trim();
        if (line.startsWith('[')) {
            // Check if this section applies to Markdown
            inMdSection = line.includes('*.md') || line === '[*]';
        } else if (inMdSection && line.startsWith('max_line_length')) {
            const match = line.match(/max_line_length\s*=\s*(\d+)/);
            if (match) maxLength = parseInt(match[1], 10);
        }
    }
    return maxLength;
}
