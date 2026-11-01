import { mkdir, writeFile } from 'node:fs/promises';
import { companyRevenue } from './no-code.mjs';

const COMPANIES = { Accenture: 1467373, Cognizant: 1058290, Infosys: 1067491, EPAM: 1352010, Globant: 1557860 };

export const fetchOutsourcing = async () => {
	const companies = await companyRevenue(COMPANIES);
	await mkdir('data/raw/outsourcing', { recursive: true });
	await writeFile('data/raw/outsourcing/revenue.json', `${JSON.stringify(companies, null, '\t')}\n`);
	console.log(`Outsourcing: ${Object.keys(companies).length} companies`);
};
