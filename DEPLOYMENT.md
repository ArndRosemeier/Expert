# 🚀 Deployment Guide - Expert Application

This guide covers deploying the Expert application to different hosting platforms.

## ⭐ Default: apps.futuremagic.de (current default going forward)

The default deployment is now the static apps host, served at
**https://apps.futuremagic.de/expert/**. It is published from this host and needs no
FTP credentials or PowerShell.

```bash
npm run build:apps                     # vite build --mode apps  → base '/expert/'
ln -sfn "$PWD/dist" "$HOME/apps/expert"   # symlink: rebuilds go live instantly
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8082/expert/
```

Notes:

- The `apps` mode sets Vite `base: '/expert/'`. A copy published under `/expert/` with
  the old `/Expert/` base would load a blank page, so always build with `build:apps`
  for this target.
- Publishing by symlink means a plain `npm run build:apps` updates the live app with no
  further step. **Do not delete `dist/` while it is the symlink target** — the published
  app goes down until the next build.
- The host is static only: no server code, no SPA history fallback (a client-side route
  404s on refresh), and no range requests.

The older DomainFactory/FTP path below still works and is unchanged.

### Output directories — one mode, one directory

`dist/` is the **live** deploy: `~/apps/expert` is a symlink to it, so anything that
writes `dist/` publishes. Only `build:apps` writes `dist/`. Every other mode writes
its own non-live directory (see `OUT_DIRS` in `vite.config.ts`):

| Mode | Command | Output directory |
|------|---------|------------------|
| `apps` | `npm run build:apps` | `dist/` — **LIVE, symlinked** |
| `domainfactory` | `npm run build:domainfactory` | `dist-domainfactory/` |
| `github` | `npm run build:github` | `dist-github/` |
| `production` (also plain `npm run build`) | `npm run build:production` | `dist-production/` |

Because each mode has its own directory, a stray non-apps build can no longer
overwrite the live base-`/expert/` bundle and silently blank the site.

## 📋 Prerequisites

- Node.js installed locally
- npm or yarn package manager
- Access to your hosting platform

## 🌐 DomainFactory Deployment

### Quick Deployment

1. **Build for production:**
   ```bash
   .\deploy-domainfactory.ps1
   ```
   
   Or manually:
   ```bash
   npm run build:production
   ```

2. **Upload files:**
   - All files from the `dist-production/` folder need to be uploaded to your domain's root directory
   - Usually this is the `html/` or `public_html/` folder in your DomainFactory hosting

### Manual Deployment Steps

1. **Build the application:**
   ```bash
   npm run build:production
   ```

2. **Access your DomainFactory hosting:**
   - Log into your DomainFactory control panel
   - Navigate to File Manager or use FTP/SFTP

3. **Upload files:**
   - Upload **ALL** files from the `dist-production/` folder to your domain's root directory
   - Ensure `index.html` is in the root of your web directory
   - Maintain the folder structure (especially the `assets/` folder)

4. **FTP/SFTP Connection Details:**
   ```
   Server: your-domain.de (or ftp.your-domain.de)
   Username: [Your FTP username from DomainFactory]
   Password: [Your FTP password from DomainFactory]
   Port: 21 (FTP) or 22 (SFTP)
   ```

### File Structure on Server

After upload, your domain root should look like:
```
your-domain.de/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── vendor-[hash].js
└── [other generated files]
```

## 📦 GitHub Pages Deployment

### Quick Deployment

1. **Deploy to GitHub Pages:**
   ```bash
   .\deploy.ps1
   ```
   
   Or manually:
   ```bash
   npm run deploy:github
   ```

### Manual Steps

1. **Build for GitHub Pages:**
   ```bash
   npm run build:github
   ```

2. **Deploy:**
   ```bash
   npm run deploy
   ```

## 🔧 Build Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Build for development/testing |
| `npm run build:production` | Build for DomainFactory hosting |
| `npm run build:github` | Build for GitHub Pages |
| `npm run deploy:production` | Build for DomainFactory (same as build:production) |
| `npm run deploy:github` | Build and deploy to GitHub Pages |
| `npm run preview` | Preview production build locally |

## 🐛 Troubleshooting

### Common Issues

1. **404 errors on page refresh:**
   - Make sure `.htaccess` file is uploaded (for Apache servers)
   - Check that your hosting supports URL rewriting

2. **Assets not loading:**
   - Verify all files in the mode's output dir (e.g. `dist-production/assets/`) are uploaded
   - Check file permissions (should be readable)

3. **Application not starting:**
   - Check browser console for JavaScript errors
   - Ensure `index.html` is in the domain root

### DomainFactory Specific

1. **File upload issues:**
   - Use Binary mode for file transfers
   - Ensure folder structure is preserved

2. **Permission issues:**
   - Files should have 644 permissions
   - Folders should have 755 permissions

## 📞 Support

If you encounter issues:

1. **DomainFactory Support:**
   - Check their documentation for file upload procedures
   - Contact their support for server-specific issues

2. **Application Issues:**
   - Check browser console for errors
   - Verify all files were uploaded correctly

## 🔄 Updates

To update your deployed application:

1. Make your changes locally
2. Test thoroughly
3. Run the deployment script again
4. Upload the new output folder's contents (e.g. `dist-production/` for DomainFactory; the FTP script uses `dist-domainfactory/`)

**Note:** You can overwrite existing files - the build process creates fresh files with new hashes for cache busting. 