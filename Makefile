# NEUBAT - Makefile
TAG ?= 2.1.0

.PHONY: portal install-deps install-deps-frontend build-frontend validate lint test smoke test-smoke test-vm test-iso-boot test-bash test-hmac test-cmdline-parser test-profiles test-p0 test-ansible validate-ansible lint-ansible test-frontend test-e2e install-deps-e2e build-iso validate-iso release ci-status ci-watch ci-log

install-deps:
	cd portal && npm install

install-deps-frontend:
	cd portal/frontend && npm install

build-frontend: install-deps-frontend
	cd portal/frontend && npm run build

portal: build-frontend
	cd portal && npm start

validate:
	@for f in scripts/*.sh; do bash -n $$f && echo "OK $$f"; done
	@node --check portal/server.js && echo "OK portal/server.js"
	@node --check portal/routes/install.js && echo "OK portal/routes/install.js"
	@node --check portal/routes/status.js && echo "OK portal/routes/status.js"
	@node --check portal/routes/admin.js && echo "OK portal/routes/admin.js"
	@node --check portal/lib/db.js && echo "OK portal/lib/db.js"
	@for f in configs/*.json; do python3 -m json.tool $$f > /dev/null && echo "OK $$f"; done

lint:
	@command -v shellcheck >/dev/null 2>&1 && shellcheck -x scripts/*.sh || echo "shellcheck no instalado; omitido"
	@if [ -d portal/frontend/node_modules ]; then cd portal/frontend && npm run lint; else echo "oxlint omitido (sin node_modules del frontend)"; fi

test:
	cd portal && npm test -- --coverage

# Fachada canónica: contraste de tokens + health + POST /api/install
smoke:
	@node portal/frontend/scripts/build-tokens.mjs --check
	@node portal/frontend/scripts/check-contrast.mjs
	@cd portal && \
	PORT=3100 node server.js >/tmp/neubat-smoke.log 2>&1 & pid=$$!; \
	ok=0; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12; do \
		if curl -sf http://127.0.0.1:3100/api/health >/dev/null; then ok=1; break; fi; \
		sleep 0.5; \
	done; \
	if [ $$ok -ne 1 ]; then echo "smoke: /api/health no respondió"; cat /tmp/neubat-smoke.log; kill $$pid 2>/dev/null || true; exit 1; fi; \
	curl -sf http://127.0.0.1:3100/api/health && echo " OK /api/health"; \
	curl -sf -X POST http://127.0.0.1:3100/api/install -H 'Content-Type: application/json' \
		-d '{"profile":"base","hostname":"neubat-test"}' && echo " OK /api/install"; \
	status=$$?; \
	kill $$pid 2>/dev/null || true; \
	wait $$pid 2>/dev/null || true; \
	exit $$status

# Alias conservado
test-smoke: smoke

# Prueba end-to-end en VM QEMU/NVMe (larga: ~40 min, opt-in). Ver tests/vm/README.md
test-vm:
	python3 tests/vm/neubat_vm_test.py

test-bash:
	@command -v bats >/dev/null 2>&1 && bats tests/bash/*.bats || echo "bats no instalado; omitido"

# Tests P0 de seguridad (T11): HMAC fail-closed + cmdline-parser + perfiles públicos
test-hmac:
	bats tests/bash/hmac.bats
	cd portal && npm test -- --testPathPatterns=hmac

test-cmdline-parser:
	bats tests/bash/cmdline-parser.bats

test-profiles:
	cd portal && npm test -- --testPathPatterns=account

test-p0: test-hmac test-cmdline-parser test-profiles

validate-ansible:
	@python3 -m json.tool configs/base.json > /dev/null && echo "OK configs/base.json"
	@command -v ansible-playbook >/dev/null 2>&1 && cd ansible && ansible-playbook --syntax-check site.yml && echo "OK ansible/site.yml syntax" || echo "ansible-playbook no instalado; omitido"

lint-ansible:
	@command -v ansible-lint >/dev/null 2>&1 && ansible-lint ansible/ || echo "ansible-lint no instalado; omitido"

test-ansible: validate-ansible lint-ansible

test-frontend: install-deps-frontend
	cd portal/frontend && npm test

# Suite E2E de navegador (Playwright). Ver docs/runbooks/e2e.md
install-deps-e2e:
	cd portal/e2e && npm install

test-e2e: build-frontend install-deps-e2e
	cd portal/e2e && npm run test:e2e

# Construir ISO híbrida con autoinstalación (requiere Docker; opt-in)
build-iso:
	bash scripts/build-iso.sh "$(TAG)"

# Validación estática de la ISO generada (checksum + contenido con xorriso; opt-in)
validate-iso:
	bash scripts/validate-iso.sh "out/neubat-$(TAG)-x86_64.iso"

# Smoke de arranque de la ISO NEUBAT en QEMU (largo; opt-in). Ver tests/vm/README.md
test-iso-boot:
	python3 tests/vm/boot_iso_smoke.py

# Remote GitHub (owner/repo) derivado de origin, para los targets de gh
GH_REPO := $(shell git remote get-url origin 2>/dev/null | sed -E 's#^https://github\.com/([^/]+/[^/.]+)(\.git)?$$#\1#')

# Estado de los pipelines del repo (requiere gh autenticado)
ci-status:
	@command -v gh >/dev/null 2>&1 || { echo "gh (GitHub CLI) no instalado o no en PATH"; exit 1; }
	gh run list --repo "$(GH_REPO)" --limit 12

# Vigila un run hasta que termina (sin RUN_ID, el último de la rama actual).
# Sale con el estado del run: verde o rojo.
ci-watch:
	@command -v gh >/dev/null 2>&1 || { echo "gh (GitHub CLI) no instalado o no en PATH"; exit 1; }
	gh run watch --repo "$(GH_REPO)" --exit-status $(RUN_ID)

# Diagnóstico de un run fallido: make ci-log RUN_ID=<id>
ci-log:
	@test -n "$(RUN_ID)" || { echo "Uso: make ci-log RUN_ID=<id>"; exit 1; }
	gh run view --repo "$(GH_REPO)" --log-failed $(RUN_ID)

# Crear release v$(TAG) en GitHub adjuntando la ISO generada (requiere gh)
release: build-iso
	gh release create v$(TAG) out/neubat-$(TAG)-x86_64.iso \
		--title "NEUBAT v$(TAG)" \
		--notes-file docs/RELEASE-v$(TAG).md \
		--repo "$(GH_REPO)"
