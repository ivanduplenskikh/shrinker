.PHONY: dashboard

dashboard:
	npm ci --prefix packages/dashboard-ui
	npm run typecheck --prefix packages/dashboard-ui
	npm run build --prefix packages/dashboard-ui
	node -e "const fs=require('fs'); fs.copyFileSync('packages/dashboard-ui/dist/app.html','internal/dashboard/ui/app.html'); fs.copyFileSync('packages/dashboard-ui/dist/assets/app.css','internal/dashboard/ui/assets/app.css'); fs.copyFileSync('packages/dashboard-ui/dist/assets/dashboard.js','internal/dashboard/ui/assets/dashboard.js');"
