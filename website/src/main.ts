import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('The application mount element is missing.')
mount(App, { target })
