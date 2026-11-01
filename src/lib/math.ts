import katex from 'katex';

export const math = (latex: string, displayMode = true) => katex.renderToString(latex, { displayMode, throwOnError: true });
