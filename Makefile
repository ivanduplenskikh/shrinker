.PHONY: dashboard

dashboard:
	npm ci --prefix packages/dashboard-ui
	npm run typecheck --prefix packages/dashboard-ui
	npm run build --prefix packages/dashboard-ui
	node scripts/embed-dashboard.mjs

dashboard-start:
	npm run start --prefix packages/dashboard-ui