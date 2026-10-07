pipeline {
  agent any
  environment { SONAR_TOKEN = credentials('sonar-token') }
  stages {
    stage('Build') {
      steps { sh 'docker build --pull -t healthcare-app:1.0.0 .' }
    }
    stage('SAST') {
      steps {
        sh '''docker run --rm --network host -u "$(id -u):$(id -g)" -e SONAR_TOKEN -e SONAR_USER_HOME=/tmp/sonar-home -e SONAR_HOST_URL=http://localhost:9000 -v "$PWD":/usr/src sonarsource/sonar-scanner-cli -Dsonar.qualitygate.wait=true -Dsonar.working.directory=/tmp/sonar-work'''
      }
    }
    stage('Security Scan') {
      steps { sh 'trivy image --severity CRITICAL --ignore-unfixed --exit-code 1 healthcare-app:1.0.0' }
    }
    stage('Deploy') {
      steps {
        sh '''
          docker save healthcare-app:1.0.0 | docker exec -i minikube sh -c 'if docker info >/dev/null 2>&1; then docker load; else ctr -n k8s.io images import -; fi'
          kubectl apply -f k8s/namespace.yaml -f k8s/rbac.yaml -f k8s/deployment.yaml -f k8s/service.yaml
          kubectl rollout restart deployment/healthcare-app -n healthcare
          kubectl rollout status deployment/healthcare-app -n healthcare --timeout=120s
        '''
      }
    }
  }
}
