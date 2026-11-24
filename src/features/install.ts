export interface InstallationState {
  standalone: boolean;
  installed: boolean;
  available: boolean;
  busy: boolean;
  message: string;
  error: string;
}

type InstallNavigator = Navigator & { install?: () => Promise<unknown>; standalone?: boolean };
type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export class Installation {
  private prompt: InstallPrompt | null = null;
  private nativeInstall: (() => Promise<unknown>) | null = null;

  constructor(readonly state: InstallationState) {}

  watch(browser: Window = window, agent: InstallNavigator = navigator): () => void {
    const display = browser.matchMedia('(display-mode: standalone)');
    this.nativeInstall = browser.isSecureContext && typeof agent.install === 'function' ? agent.install.bind(agent) : null;
    const update = () => {
      this.state.standalone = display.matches || agent.standalone === true;
      this.state.available = !this.state.standalone && !this.state.installed && !!(this.nativeInstall || this.prompt);
    };
    const ready = (event: Event) => {
      if (!browser.isSecureContext) return;
      event.preventDefault();
      this.prompt = event as InstallPrompt;
      update();
    };
    const installed = () => {
      this.prompt = null;
      this.state.installed = true;
      this.state.available = false;
      this.state.message = 'Limethat was installed. You can open it from your app launcher.';
    };
    update();
    browser.addEventListener('beforeinstallprompt', ready);
    browser.addEventListener('appinstalled', installed);
    display.addEventListener('change', update);
    return () => {
      browser.removeEventListener('beforeinstallprompt', ready);
      browser.removeEventListener('appinstalled', installed);
      display.removeEventListener('change', update);
      this.prompt = null;
      this.nativeInstall = null;
      this.state.available = false;
    };
  }

  async install(): Promise<void> {
    if (!this.state.available || this.state.busy) return;
    this.state.busy = true;
    this.state.error = '';
    this.state.message = '';
    try {
      if (this.nativeInstall) {
        await this.nativeInstall();
        this.state.available = false;
        this.state.message = 'Limethat was installed or opened.';
      } else if (this.prompt) {
        const prompt = this.prompt;
        this.prompt = null;
        this.state.available = false;
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        this.state.message = outcome === 'accepted'
          ? 'Installation accepted. Your browser will finish setting up Limethat.'
          : 'Installation canceled. You can keep using Limethat here.';
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.state.message = 'Installation was canceled or could not complete. You can keep using Limethat here.';
      } else {
        this.state.error = 'Installation could not start. You can keep using Limethat in your browser.';
        console.error('Limethat installation failed.', error);
      }
    } finally {
      this.state.busy = false;
    }
  }
}
