.PHONY: dashboard

dashboard:
	npm ci --prefix packages/dashboard-ui
	npm run typecheck --prefix packages/dashboard-ui
	npm run build --prefix packages/dashboard-ui
	cp packages/dashboard-ui/dist/index.html internal/dashboard/ui/app.html
	cp packages/dashboard-ui/dist/assets/index.css internal/dashboard/ui/assets/app.css
	cp packages/dashboard-ui/dist/assets/dashboard.js internal/dashboard/ui/assets/dashboard.js
