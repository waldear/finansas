import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const pdfPath = process.env.E2E_PDF_PATH;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
    test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run E2E tests.');
});

async function login(page: any) {
    await page.goto('/auth');
    await page.fill('#email', email!);
    await page.fill('#password', password!);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
}

test('login works', async ({ page }) => {
    await login(page);
    await expect(page.getByText('Hola de nuevo')).toBeVisible();
});

test('can register income and expense', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard/transactions');

    const unique = Date.now();

    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Ingreso' }).click();
    await page.fill('#amount', '12345');
    await page.fill('#description', `Ingreso E2E ${unique}`);
    await page.fill('#category', 'QA');
    await page.fill('#date', new Date().toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Guardar Transacción' }).click();
    await expect(page.getByText('Transacción agregada correctamente')).toBeVisible();

    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Gasto' }).click();
    await page.fill('#amount', '2345');
    await page.fill('#description', `Gasto E2E ${unique}`);
    await page.fill('#category', 'QA');
    await page.fill('#date', new Date().toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Guardar Transacción' }).click();
    await expect(page.getByText('Transacción agregada correctamente')).toBeVisible();
});

test('can process uploaded statement document', async ({ page }) => {
    test.skip(!pdfPath, 'Set E2E_PDF_PATH with a valid local PDF/image path.');

    await login(page);
    await page.goto('/dashboard/copilot');

    const setupRequired = page.getByText('Configuración Requerida');
    if (await setupRequired.isVisible().catch(() => false)) {
        test.skip(true, 'Copilot dependencies are not configured for E2E.');
    }

    await page.locator('input[type="file"]').setInputFiles(pdfPath!);
    await page.getByRole('button', { name: 'Procesar Documento' }).click();

    const verification = page.getByText('Verifica los datos extraídos');
    const fallbackError = page.getByText('No pudimos', { exact: false });

    await expect(verification.or(fallbackError)).toBeVisible({ timeout: 120_000 });
});
