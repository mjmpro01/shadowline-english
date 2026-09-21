// Shadowline CI/CD — runs on the VPS Jenkins controller.
//
// Job setup (once in the UI): New Item → Pipeline → "Pipeline script from SCM"
//   SCM: Git → your GitHub URL → credentials (deploy key or PAT)
//   Script Path: Jenkinsfile
//   Build Triggers: GitHub hook trigger for GITScm polling
//
// Env overrides (Jenkins → Manage → System → Global properties, or job env):
//   SHADOWLINE_ROOT   default /opt/shadowline
//   DEPLOY_COMPOSE    default ${SHADOWLINE_ROOT}/server
//   VITE_API_URL      public API origin baked into the SPA (e.g. https://shadowline.example.com)

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 45, unit: 'MINUTES')
  }

  environment {
    SHADOWLINE_ROOT = "${env.SHADOWLINE_ROOT ?: '/opt/shadowline'}"
    DEPLOY_COMPOSE  = "${env.DEPLOY_COMPOSE ?: "${SHADOWLINE_ROOT}/server"}"
    CI              = 'true'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Test app') {
      agent {
        docker {
          image 'node:22-bookworm'
          reuseNode true
        }
      }
      steps {
        dir('app') {
          sh 'corepack enable || true'
          sh 'yarn install --frozen-lockfile'
          sh 'yarn lint'
          sh 'yarn test'
          sh 'yarn build'
        }
      }
    }

    stage('Test server') {
      agent {
        docker {
          image 'golang:1.26-bookworm'
          reuseNode true
        }
      }
      environment {
        // Prefer the toolchain the image ships; allow Go to fetch if the
        // bookworm tag lags go.mod slightly.
        GOTOOLCHAIN = 'auto'
      }
      steps {
        dir('server') {
          sh 'go test ./internal/keycloak/ ./internal/config/ ./internal/auth/ -count=1'
        }
      }
    }

    stage('Deploy') {
      when {
        anyOf {
          branch 'main'
          branch 'master'
          tag pattern: 'v*', comparator: 'GLOB'
        }
      }
      steps {
        sh '''
          set -euo pipefail
          ROOT="${SHADOWLINE_ROOT}"
          COMPOSE_DIR="${DEPLOY_COMPOSE}"

          if [ ! -d "$COMPOSE_DIR" ]; then
            echo "Deploy tree missing at $COMPOSE_DIR — clone the repo to $ROOT on the VPS first."
            exit 1
          fi

          # Sync this workspace into the deploy checkout (preserves server/.env).
          rsync -a --delete \
            --exclude '.git/' \
            --exclude 'server/.env' \
            --exclude '**/node_modules/' \
            --exclude 'app/dist/' \
            ./ "$ROOT/"

          # SPA build from the Test app stage (reuseNode keeps workspace).
          mkdir -p "$ROOT/app/dist"
          if [ -d app/dist ]; then
            rsync -a --delete app/dist/ "$ROOT/app/dist/"
          fi

          cd "$COMPOSE_DIR"
          docker compose up -d --build
        '''
      }
    }
  }

  post {
    always {
      cleanWs(deleteDirs: true, notFailBuild: true)
    }
  }
}
