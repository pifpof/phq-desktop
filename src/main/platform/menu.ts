import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { isMac } from './index'

export function buildMenu(openSettings: () => void): void {
  const settings: MenuItemConstructorOptions = {
    label: 'Settings...',
    accelerator: 'CmdOrCtrl+,',
    click: openSettings
  }
  const edit: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  }
  const view: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      ...(app.isPackaged ? [] : ([{ role: 'toggleDevTools' }] as MenuItemConstructorOptions[]))
    ]
  }

  const template: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            settings,
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        edit,
        view,
        { role: 'windowMenu' }
      ]
    : [{ label: 'File', submenu: [settings, { type: 'separator' }, { role: 'quit' }] }, edit, view]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
