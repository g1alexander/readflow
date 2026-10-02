import { $, toast } from './ui';

export function initLogin() {
  const form = $<HTMLFormElement>('#login-form');
  const email = $<HTMLInputElement>('#email');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    window.location.href = '/tablero';
  });
  $('#magic-link').addEventListener('click', () => {
    const value = email.value.trim();
    if (!value || !email.checkValidity()) {
      email.focus();
      toast('Escribe tu correo para recibir el enlace');
      return;
    }
    toast('Te enviamos un enlace a ' + value, 'mail');
  });
}
