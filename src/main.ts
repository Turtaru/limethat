import { mount } from 'svelte';
import App from './App.svelte';
import './lib/ui-kit/styles/ui.css';
import './lib/ui-kit/styles/application.css';

mount(App, { target: document.getElementById('app')! });
