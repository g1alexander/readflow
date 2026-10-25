import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { defaultStorage, sessionStorage } from 'aws-amplify/utils';

const REMEMBER_KEY = 'readflow:remember';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.PUBLIC_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.PUBLIC_COGNITO_USER_POOL_CLIENT_ID,
      loginWith: { email: true },
    },
  },
});
useStorage(localStorage.getItem(REMEMBER_KEY) !== '0');

function useStorage(remember: boolean) {
  cognitoUserPoolsTokenProvider.setKeyValueStorage(remember ? defaultStorage : sessionStorage);
}

export function setRemember(remember: boolean) {
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  useStorage(remember);
}

export async function hasSession(): Promise<boolean> {
  try {
    const { tokens } = await fetchAuthSession();
    return Boolean(tokens?.idToken);
  } catch {
    return false;
  }
}

export async function accessToken(): Promise<string> {
  const { tokens } = await fetchAuthSession();
  const token = tokens?.accessToken?.toString();
  if (!token) throw new Error('No session');
  return token;
}

export async function logout() {
  await signOut();
  window.location.replace('/');
}

export async function guard() {
  const mode = document.documentElement.dataset.auth;
  if (!mode) return;
  const signedIn = await hasSession();
  if (mode === 'private' && !signedIn) return window.location.replace('/');
  if (mode === 'guest' && signedIn) return window.location.replace('/tablero');
  document.documentElement.dataset.authReady = '';
  document.querySelectorAll('[data-logout]').forEach((el) => el.addEventListener('click', logout));
}
