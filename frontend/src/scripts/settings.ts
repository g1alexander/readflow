import { ApiError, getSettings, putSettings } from './api';
import { $, toast } from './ui';

export async function initSettings() {
  const form = $<HTMLFormElement>('#settings-form');
  const email = $<HTMLInputElement>('#kindle-email');
  const error = $('#settings-error');
  const save = $<HTMLButtonElement>('#settings-save');

  const showError = (msg: string) => { error.textContent = msg; error.hidden = !msg; };

  try {
    email.value = (await getSettings()).kindleEmail ?? '';
    save.disabled = false;
  } catch (err) {
    console.error(err);
    toast('No se pudieron cargar los ajustes');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    save.disabled = true;
    try {
      const value = email.value.trim();
      const saved = await putSettings({ kindleEmail: value || null });
      email.value = saved.kindleEmail ?? '';
      toast(saved.kindleEmail ? 'Correo de Kindle guardado' : 'Correo de Kindle quitado', 'check');
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError && err.status === 400) showError('Correo no válido: usa una dirección @kindle.com');
      else toast('No se pudo guardar, intenta de nuevo');
    } finally {
      save.disabled = false;
    }
  });
}
