.PHONY: dashboard dashboard-start

dashboard:
	npm ci --prefix packages/dashboard-ui
	npm run typecheck --prefix packages/dashboard-ui
	npm run build --prefix packages/dashboard-ui
	node scripts/embed-dashboard.mjs

dashboard-start:
	cd packages/dashboard-ui && npm run start

install-locally:
	make dashboard
	go run ./cmd/installer install