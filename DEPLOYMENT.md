# 🚀 Deployment Guide - Expert Application

This guide covers deploying the Expert application to different hosting platforms.

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
   - All files from the `dist/` folder need to be uploaded to your domain's root directory
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
   - Upload **ALL** files from the `dist/` folder to your domain's root directory
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
   - Verify all files in `dist/assets/` are uploaded
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
4. Upload the new `dist/` folder contents

**Note:** You can overwrite existing files - the build process creates fresh files with new hashes for cache busting. 