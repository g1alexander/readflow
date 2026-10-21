import { signIn } from 'aws-amplify/auth';
import { setRemember } from './auth';
import { $, toast } from './ui';

const ERRORS: Record<string, string> = {
  NotAuthorizedException: 'Correo o contraseña incorrectos',
  UserNotFoundException: 'Correo o contraseña incorrectos',
  PasswordResetRequiredException: 'Debes restablecer tu contraseña',
  TooManyRequestsException: 'Demasiados intentos, espera un momento',
  LimitExceededException: 'Demasiados intentos, espera un momento',
};

export function initLogin() {
  const form = $<HTMLFormElement>('#login-form');
  const email = $<HTMLInputElement>('#email');
  const password = $<HTMLInputElement>('#password');
  const remember = $<HTMLInputElement>('#remember');
  const submit = $<HTMLButtonElement>('#login-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      (email.checkValidity() ? password : email).focus();
      toast('Escribe tu correo y tu contraseña');
      return;
    }
    submit.disabled = true;
    try {
      setRemember(remember.checked);
      const { isSignedIn, nextStep } = await signIn({
        username: email.value.trim(),
        password: password.value,
      });
      if (isSignedIn) {
        window.location.replace('/tablero');
        return;
      }
      toast(`Paso de inicio de sesión no soportado: ${nextStep.signInStep}`);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      toast(ERRORS[name] ?? 'No se pudo iniciar sesión, intenta de nuevo');
    } finally {
      submit.disabled = false;
    }
  });
}
