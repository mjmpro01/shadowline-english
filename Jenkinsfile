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
        script {
          // Kept for the Deploy condition: a plain Pipeline job (not a
          // multibranch one) has no BRANCH_NAME, so `branch 'main'` is never
          // true there and nothing would ever deploy. The checkout says which
          // branch it took, as origin/main.
          env.GIT_BRANCH = checkout(scm).GIT_BRANCH ?: ''
        }
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
        // The admin console is its own build with its own dependencies. Both
        // dists go into one image — they are one origin — so both have to be
        // built here for the deploy step below to have them.
        dir('app-admin') {
          sh 'npm ci'
          sh 'npm run lint'
          // The tests too, which `build` leaves out: one reads the learner
          // app's source, and the console's Docker build has only its own.
          sh 'npm run typecheck'
          sh 'npm test'
          sh 'npm run build'
        }
      }
    }

    // The server's API and database tests and the workers' tests all need a
    // Postgres to create their own databases in, so they share one throwaway
    // container for the length of this stage. Until this stage existed CI ran
    // three small Go packages and no Python at all: the API, the store and
    // every worker reached production untested.
    stage('Test server and workers') {
      steps {
        script {
          docker.image('postgres:16-alpine').withRun('-e POSTGRES_PASSWORD=ci') { pg ->
            docker.image('postgres:16-alpine').inside("--link ${pg.id}:db") {
              sh 'for i in $(seq 1 60); do pg_isready -q -h db -U postgres && exit 0; sleep 1; done; echo "Postgres did not start"; exit 1'
            }
            withEnv(['TEST_DATABASE_URL=postgres://postgres:ci@db:5432/postgres?sslmode=disable']) {
              // Caches under /tmp, inside the container: the workspace is
              // rsynced into the deploy tree, and the image's HOME may not be
              // writable by the Jenkins user the container runs as.
              docker.image('golang:1.26-bookworm').inside("--link ${pg.id}:db -e GOTOOLCHAIN=auto -e GOCACHE=/tmp/go-build -e GOMODCACHE=/tmp/go-mod") {
                dir('server') {
                  sh 'go vet ./...'
                  sh 'go test ./... -count=1'
                }
              }
              // As root for apt (ffmpeg is what the workers cut and decode
              // with), so nothing is written into the workspace: no bytecode,
              // no pytest cache, the virtualenv in /tmp. Downloads are kept in
              // a named volume between builds.
              docker.image('python:3.12-bookworm').inside("--link ${pg.id}:db -u root -e PYTHONDONTWRITEBYTECODE=1 -v shadowline-ci-pip:/root/.cache/pip") {
                dir('scoring') {
                  sh 'apt-get update -qq && apt-get install -y -qq --no-install-recommends ffmpeg libsndfile1 > /dev/null'
                  sh 'python -m venv /tmp/venv && /tmp/venv/bin/pip install -q -r requirements-dev.txt'
                  sh '/tmp/venv/bin/python -m pytest -q -p no:cacheprovider'
                }
              }
            }
          }
        }
      }
    }

    stage('Deploy') {
      when {
        anyOf {
          branch 'main'
          branch 'master'
          tag pattern: 'v*', comparator: 'GLOB'
          expression { env.GIT_BRANCH in ['origin/main', 'origin/master', 'main', 'master'] }
        }
      }
      steps {
        // An OCI Auth Token for Oracle's registry: Jenkins → Credentials,
        // "Username with password", ID `ocir`. Username <namespace>/<user>.
        withCredentials([usernamePassword(credentialsId: 'ocir', usernameVariable: 'OCIR_USER', passwordVariable: 'OCIR_TOKEN')]) {
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
              --exclude 'app-admin/dist/' \
              ./ "$ROOT/"

            # Which commit this is: the images' tag, and baked into each image
            # so the console's System page can show it. Asked here, in the
            # workspace: the deploy tree has no .git.
            SHADOWLINE_VERSION="$(git rev-parse HEAD | cut -c1-7)"
            IMAGE_TAG="$SHADOWLINE_VERSION"
            export SHADOWLINE_VERSION IMAGE_TAG

            cd "$COMPOSE_DIR"
            REGISTRY="$(sed -n 's/^REGISTRY=//p' .env | tail -n 1)"
            if [ -z "$REGISTRY" ]; then
              echo "Set REGISTRY in $COMPOSE_DIR/.env, e.g. sin.ocir.io/<namespace>/shadowline (docs/deploy-prod.md)."
              exit 1
            fi
            echo "$OCIR_TOKEN" | docker login "${REGISTRY%%/*}" -u "$OCIR_USER" --password-stdin

            # Build the three images (api, workers, web) and push them. A push
            # that fails stops the deploy: what runs is always in the registry.
            docker compose build
            docker compose push api scoring web

            # Record what is deployed, so a reboot or a manual `docker compose up`
            # runs this commit too. Rolling back is writing an older tag here
            # and `docker compose up -d`.
            sed -i '/^IMAGE_TAG=/d' .env
            echo "IMAGE_TAG=$IMAGE_TAG" >> .env

            docker compose pull --quiet
            docker compose up -d --no-build --remove-orphans
            docker compose ps
          '''
        }
      }
    }
  }

  post {
    always {
      cleanWs(deleteDirs: true, notFailBuild: true)
    }
  }
}
