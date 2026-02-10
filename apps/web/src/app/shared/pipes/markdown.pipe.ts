import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function parseInline(text: string): string {
	return (
		text
			// inline code (must come before bold/italic to avoid conflicts)
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			// bold + italic
			.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
			// bold
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/__(.+?)__/g, '<strong>$1</strong>')
			// italic
			.replace(/\*(.+?)\*/g, '<em>$1</em>')
			.replace(/_(.+?)_/g, '<em>$1</em>')
	);
}

function parseMarkdown(src: string): string {
	const lines = src.split('\n');
	const out: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		// blank line
		if (line.trim() === '') {
			i++;
			continue;
		}

		// headers
		const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			out.push(
				`<h${level}>${parseInline(escapeHtml(headingMatch[2]))}</h${level}>`,
			);
			i++;
			continue;
		}

		// unordered list
		if (/^\s*[-*+]\s/.test(line)) {
			out.push('<ul>');
			while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) {
				const content = lines[i].replace(/^\s*[-*+]\s+/, '');
				out.push(`<li>${parseInline(escapeHtml(content))}</li>`);
				i++;
			}
			out.push('</ul>');
			continue;
		}

		// ordered list
		if (/^\s*\d+[.)]\s/.test(line)) {
			out.push('<ol>');
			while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) {
				const content = lines[i].replace(/^\s*\d+[.)]\s+/, '');
				out.push(`<li>${parseInline(escapeHtml(content))}</li>`);
				i++;
			}
			out.push('</ol>');
			continue;
		}

		// fenced code block
		if (line.startsWith('```')) {
			i++;
			const codeLines: string[] = [];
			while (i < lines.length && !lines[i].startsWith('```')) {
				codeLines.push(escapeHtml(lines[i]));
				i++;
			}
			if (i < lines.length) i++; // skip closing ```
			out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
			continue;
		}

		// blockquote
		if (line.startsWith('>')) {
			const quoteLines: string[] = [];
			while (i < lines.length && lines[i].startsWith('>')) {
				quoteLines.push(lines[i].replace(/^>\s?/, ''));
				i++;
			}
			out.push(
				`<blockquote><p>${parseInline(escapeHtml(quoteLines.join(' ')))}</p></blockquote>`,
			);
			continue;
		}

		// horizontal rule
		if (/^[-*_]{3,}\s*$/.test(line)) {
			out.push('<hr>');
			i++;
			continue;
		}

		// paragraph: collect consecutive non-blank non-special lines
		const paraLines: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() !== '' &&
			!/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|```|>|[-*_]{3,}\s*$)/.test(lines[i])
		) {
			paraLines.push(escapeHtml(lines[i]));
			i++;
		}
		if (paraLines.length > 0) {
			out.push(`<p>${parseInline(paraLines.join('<br>'))}</p>`);
		}
	}

	return out.join('\n');
}

@Pipe({
	name: 'markdown',
	standalone: true,
})
export class MarkdownPipe implements PipeTransform {
	constructor(private sanitizer: DomSanitizer) {}

	transform(value: string | null | undefined): SafeHtml {
		if (!value) return '';
		return this.sanitizer.bypassSecurityTrustHtml(parseMarkdown(value));
	}
}
