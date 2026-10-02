/**
 * Canonical skill dictionary.
 *
 * Purpose: turn the infinite spelling variants of the hiring world
 * ("Postgres", "psql", "PostgreSQL 14") into one canonical concept so that
 * matching is reproducible and explainable. This dictionary powers:
 *   - EXACT matches (verbatim, case-insensitive)
 *   - STRONG_RELATED matches (alias hit, or parent/child relation)
 * Aliases and parents are also used to build evidence search terms.
 *
 * Categories are deliberately coarse and non-hierarchical; `parents` carries the
 * hierarchy where it matters for relatedness.
 */

export type SkillCategory =
  | 'software'
  | 'data'
  | 'cybersecurity'
  | 'cloud'
  | 'devops'
  | 'product'
  | 'design'
  | 'business'
  | 'professional'
  | 'language';

export interface SkillEntry {
  canonical: string;
  aliases: string[];
  parents: string[];
  category: SkillCategory;
}

export const SKILL_DICTIONARY: readonly SkillEntry[] = [
  // ------------------------------------------------------------------ languages
  { canonical: 'JavaScript', aliases: ['js', 'ecmascript', 'es6', 'es2015', 'javascript es6', 'vanilla javascript'], parents: ['Programming Languages', 'Web Development'], category: 'software' },
  { canonical: 'TypeScript', aliases: ['ts', 'typed javascript', 'typescript 5'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Python', aliases: ['python3', 'py', 'python 3', 'cpython'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Java', aliases: ['core java', 'java8', 'java 8', 'j2ee', 'java ee'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'C++', aliases: ['cpp', 'c plus plus', 'cplusplus'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'C#', aliases: ['csharp', 'c sharp', 'dotnet c#'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'C', aliases: ['ansi c', 'c language'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Go', aliases: ['golang', 'go language'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Rust', aliases: ['rustlang'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Ruby', aliases: ['ruby language'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'PHP', aliases: ['php7', 'php8'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Kotlin', aliases: ['kotlin android'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Swift', aliases: ['swift5', 'swift ios'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Scala', aliases: ['scala language'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'R', aliases: ['r language', 'rstudio', 'r programming'], parents: ['Programming Languages'], category: 'data' },
  { canonical: 'MATLAB', aliases: ['matlab scripting'], parents: ['Programming Languages'], category: 'data' },
  { canonical: 'SQL', aliases: ['ansi sql', 'structured query language'], parents: ['Databases'], category: 'data' },
  { canonical: 'Bash', aliases: ['shell scripting', 'shell script', 'sh', 'zsh', 'bash scripting'], parents: ['Programming Languages', 'Linux'], category: 'software' },
  { canonical: 'PowerShell', aliases: ['powershell scripting', 'ps1'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Perl', aliases: [], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Objective-C', aliases: ['objective c', 'objc'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Dart', aliases: [], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Elixir', aliases: ['elixir phoenix'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Haskell', aliases: [], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Lua', aliases: [], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Visual Basic', aliases: ['vb', 'vb.net', 'vbnet', 'vba'], parents: ['Programming Languages'], category: 'software' },
  { canonical: 'Solidity', aliases: ['solidity smart contracts'], parents: ['Programming Languages'], category: 'software' },

  // ------------------------------------------------------------------- frontend
  { canonical: 'React', aliases: ['react.js', 'reactjs', 'react 18', 'react hooks'], parents: ['Frontend Frameworks', 'JavaScript'], category: 'software' },
  { canonical: 'Next.js', aliases: ['nextjs', 'next js', 'next.js 14'], parents: ['React'], category: 'software' },
  { canonical: 'Angular', aliases: ['angularjs', 'angular 2', 'angular 15', 'ng'], parents: ['Frontend Frameworks'], category: 'software' },
  { canonical: 'Vue.js', aliases: ['vue', 'vuejs', 'vue 3'], parents: ['Frontend Frameworks'], category: 'software' },
  { canonical: 'Svelte', aliases: ['sveltekit'], parents: ['Frontend Frameworks'], category: 'software' },
  { canonical: 'Redux', aliases: ['redux toolkit', 'rtk', 'redux-saga'], parents: ['React'], category: 'software' },
  { canonical: 'HTML', aliases: ['html5', 'semantic html'], parents: ['Web Development'], category: 'software' },
  { canonical: 'CSS', aliases: ['css3', 'cascading style sheets', 'flexbox', 'css grid'], parents: ['Web Development'], category: 'software' },
  { canonical: 'Sass', aliases: ['scss', 'less', 'stylus'], parents: ['CSS'], category: 'software' },
  { canonical: 'Tailwind CSS', aliases: ['tailwind', 'tailwindcss', 'tailwind ui'], parents: ['CSS'], category: 'software' },
  { canonical: 'Bootstrap', aliases: ['bootstrap 5'], parents: ['CSS'], category: 'software' },
  { canonical: 'Material UI', aliases: ['mui', 'material-ui', 'material design'], parents: ['React'], category: 'software' },
  { canonical: 'Webpack', aliases: ['webpack 5', 'module bundler'], parents: ['Frontend Build Tools'], category: 'software' },
  { canonical: 'Vite', aliases: ['vitejs'], parents: ['Frontend Build Tools'], category: 'software' },
  { canonical: 'Babel', aliases: ['babeljs'], parents: ['Frontend Build Tools'], category: 'software' },
  { canonical: 'jQuery', aliases: ['jquery ui'], parents: ['Web Development'], category: 'software' },
  { canonical: 'Web Accessibility', aliases: ['a11y', 'wcag', 'aria', 'accessibility', 'wcag 2.1'], parents: ['Web Development'], category: 'software' },
  { canonical: 'Responsive Design', aliases: ['responsive web design', 'mobile-first', 'mobile first'], parents: ['CSS'], category: 'design' },
  { canonical: 'Progressive Web Apps', aliases: ['pwa', 'service workers'], parents: ['Web Development'], category: 'software' },
  { canonical: 'React Native', aliases: ['react-native', 'rn'], parents: ['React', 'Mobile Development'], category: 'software' },
  { canonical: 'Flutter', aliases: ['flutter dart'], parents: ['Mobile Development'], category: 'software' },
  { canonical: 'Electron', aliases: ['electron.js'], parents: ['Web Development'], category: 'software' },

  // ------------------------------------------------------------------- backend
  { canonical: 'Node.js', aliases: ['node', 'nodejs', 'node js'], parents: ['JavaScript', 'Backend Development'], category: 'software' },
  { canonical: 'Express', aliases: ['express.js', 'expressjs'], parents: ['Node.js'], category: 'software' },
  { canonical: 'NestJS', aliases: ['nest.js', 'nestjs framework'], parents: ['Node.js'], category: 'software' },
  { canonical: 'Django', aliases: ['django rest framework', 'drf'], parents: ['Python'], category: 'software' },
  { canonical: 'Flask', aliases: ['flask api'], parents: ['Python'], category: 'software' },
  { canonical: 'FastAPI', aliases: ['fast api'], parents: ['Python'], category: 'software' },
  { canonical: 'Spring Boot', aliases: ['spring', 'springboot', 'spring framework'], parents: ['Java'], category: 'software' },
  { canonical: 'Ruby on Rails', aliases: ['rails', 'ror'], parents: ['Ruby'], category: 'software' },
  { canonical: 'Laravel', aliases: ['laravel php'], parents: ['PHP'], category: 'software' },
  { canonical: '.NET', aliases: ['dotnet', 'dot net', 'asp.net', 'aspnet', 'net core', '.net core'], parents: ['Backend Development'], category: 'software' },
  { canonical: 'REST APIs', aliases: ['rest', 'restful', 'rest api', 'api design', 'web services', 'restful services'], parents: ['Backend Development'], category: 'software' },
  { canonical: 'GraphQL', aliases: ['graph ql', 'apollo graphql', 'apollo server'], parents: ['Backend Development'], category: 'software' },
  { canonical: 'gRPC', aliases: ['grpc', 'protocol buffers', 'protobuf'], parents: ['Backend Development'], category: 'software' },
  { canonical: 'Microservices', aliases: ['micro services', 'service oriented architecture', 'soa'], parents: ['Software Architecture'], category: 'software' },
  { canonical: 'WebSockets', aliases: ['websocket', 'socket.io', 'socketio'], parents: ['Backend Development'], category: 'software' },
  { canonical: 'Serverless', aliases: ['serverless computing', 'faas', 'function as a service', 'lambda functions'], parents: ['Cloud Computing'], category: 'cloud' },
  { canonical: 'Event-Driven Architecture', aliases: ['event driven', 'pub sub', 'pubsub', 'event streaming'], parents: ['Software Architecture'], category: 'software' },
  { canonical: 'Apache Kafka', aliases: ['kafka', 'confluent kafka', 'kafka streams'], parents: ['Event-Driven Architecture'], category: 'data' },
  { canonical: 'RabbitMQ', aliases: ['rabbit mq', 'amqp'], parents: ['Message Queues'], category: 'software' },
  { canonical: 'Message Queues', aliases: ['mq', 'message queue', 'amazon sqs', 'sqs', 'sns'], parents: ['Event-Driven Architecture'], category: 'software' },
  { canonical: 'Redis', aliases: ['redis cache', 'redis cluster'], parents: ['Caching'], category: 'software' },
  { canonical: 'Memcached', aliases: ['memcache'], parents: ['Caching'], category: 'software' },
  { canonical: 'Caching', aliases: ['cache', 'caching strategies', 'cdn caching', 'cache invalidation'], parents: ['Software Architecture'], category: 'software' },
  { canonical: 'Elasticsearch', aliases: ['elastic search', 'open search', 'opensearch'], parents: ['Search Infrastructure'], category: 'data' },
  { canonical: 'Nginx', aliases: ['nginx server', 'reverse proxy'], parents: ['Web Servers'], category: 'devops' },
  { canonical: 'Apache HTTP Server', aliases: ['apache httpd', 'apache web server'], parents: ['Web Servers'], category: 'devops' },
  { canonical: 'OAuth', aliases: ['oauth2', 'oauth 2.0', 'openid connect', 'oidc'], parents: ['Identity and Access Management'], category: 'cybersecurity' },
  { canonical: 'JWT', aliases: ['json web tokens', 'json web token'], parents: ['Identity and Access Management'], category: 'cybersecurity' },

  // ------------------------------------------------------------------ databases
  { canonical: 'Relational Databases', aliases: ['rdbms', 'relational db', 'sql databases'], parents: ['Databases'], category: 'data' },
  { canonical: 'PostgreSQL', aliases: ['postgres', 'psql', 'postgresql 15'], parents: ['Relational Databases'], category: 'data' },
  { canonical: 'MySQL', aliases: ['my sql'], parents: ['Relational Databases'], category: 'data' },
  { canonical: 'MariaDB', aliases: ['mariadb server'], parents: ['Relational Databases'], category: 'data' },
  { canonical: 'Microsoft SQL Server', aliases: ['mssql', 'sql server', 't-sql', 'tsql'], parents: ['Relational Databases'], category: 'data' },
  { canonical: 'Oracle Database', aliases: ['oracle db', 'oracle sql', 'pl/sql', 'plsql'], parents: ['Relational Databases'], category: 'data' },
  { canonical: 'SQLite', aliases: ['sqlite3'], parents: ['Relational Databases'], category: 'data' },
  { canonical: 'NoSQL', aliases: ['nosql databases', 'non-relational databases', 'document databases'], parents: ['Databases'], category: 'data' },
  { canonical: 'MongoDB', aliases: ['mongo', 'mongo db', 'mongoose'], parents: ['NoSQL'], category: 'data' },
  { canonical: 'DynamoDB', aliases: ['dynamo db', 'aws dynamodb'], parents: ['NoSQL'], category: 'data' },
  { canonical: 'Cassandra', aliases: ['apache cassandra'], parents: ['NoSQL'], category: 'data' },
  { canonical: 'Neo4j', aliases: ['graph database', 'graphdb', 'cypher'], parents: ['NoSQL'], category: 'data' },
  { canonical: 'Snowflake', aliases: ['snowflake data warehouse'], parents: ['Data Warehousing'], category: 'data' },
  { canonical: 'BigQuery', aliases: ['big query', 'google bigquery'], parents: ['Data Warehousing'], category: 'data' },
  { canonical: 'Amazon Redshift', aliases: ['redshift', 'aws redshift'], parents: ['Data Warehousing'], category: 'data' },
  { canonical: 'Databricks', aliases: ['databricks lakehouse', 'delta lake'], parents: ['Data Warehousing'], category: 'data' },

  // -------------------------------------------------- data engineering / science
  { canonical: 'Apache Spark', aliases: ['spark', 'pyspark', 'spark sql'], parents: ['Big Data'], category: 'data' },
  { canonical: 'Big Data', aliases: ['large scale data', 'petabyte scale'], parents: [], category: 'data' },
  { canonical: 'Apache Hadoop', aliases: ['hadoop', 'hdfs', 'mapreduce', 'hive'], parents: ['Big Data'], category: 'data' },
  { canonical: 'Airflow', aliases: ['apache airflow', 'dag orchestration'], parents: ['Data Pipelines'], category: 'data' },
  { canonical: 'dbt', aliases: ['data build tool', 'dbt models'], parents: ['Data Pipelines'], category: 'data' },
  { canonical: 'ETL', aliases: ['etl/elt', 'elt', 'extract transform load', 'data pipelines', 'data pipeline', 'data ingestion'], parents: ['Data Engineering'], category: 'data' },
  { canonical: 'Data Warehousing', aliases: ['data warehouse', 'dimensional modeling', 'star schema', 'snowflake schema'], parents: ['Data Engineering'], category: 'data' },
  { canonical: 'Data Modeling', aliases: ['data modelling', 'dimensional model', 'entity relationship modeling', 'schema design'], parents: ['Data Engineering'], category: 'data' },
  { canonical: 'Data Quality', aliases: ['data validation', 'data cleansing', 'data integrity', 'data profiling'], parents: ['Data Governance'], category: 'data' },
  { canonical: 'Data Governance', aliases: ['data lineage', 'master data management', 'data catalog'], parents: ['Data Engineering'], category: 'data' },
  { canonical: 'Data Visualization', aliases: ['data visualisation', 'dataviz', 'charts', 'dashboarding', 'dashboards'], parents: ['Data Analysis'], category: 'data' },
  { canonical: 'Tableau', aliases: ['tableau desktop', 'tableau server'], parents: ['Data Visualization'], category: 'data' },
  { canonical: 'Power BI', aliases: ['powerbi', 'microsoft power bi', 'dax'], parents: ['Data Visualization'], category: 'data' },
  { canonical: 'Looker', aliases: ['looker studio', 'lookml'], parents: ['Data Visualization'], category: 'data' },
  { canonical: 'Microsoft Excel', aliases: ['excel', 'advanced excel', 'vlookup', 'pivot tables', 'spreadsheets'], parents: ['Data Analysis'], category: 'data' },
  { canonical: 'Pandas', aliases: ['python pandas', 'dataframes'], parents: ['Python'], category: 'data' },
  { canonical: 'NumPy', aliases: ['numpy arrays', 'scipy'], parents: ['Python'], category: 'data' },
  { canonical: 'Data Analysis', aliases: ['data analytics', 'exploratory data analysis', 'eda', 'business intelligence'], parents: [], category: 'data' },
  { canonical: 'Statistics', aliases: ['statistical analysis', 'hypothesis testing', 'regression analysis', 'descriptive statistics'], parents: ['Data Analysis'], category: 'data' },
  { canonical: 'A/B Testing', aliases: ['ab testing', 'split testing', 'experimentation', 'multivariate testing'], parents: ['Statistics'], category: 'data' },
  { canonical: 'Predictive Modeling', aliases: ['predictive modelling', 'forecasting models', 'time series analysis', 'time series forecasting'], parents: ['Machine Learning'], category: 'data' },
  { canonical: 'Machine Learning', aliases: ['ml', 'supervised learning', 'unsupervised learning', 'model training', 'scikit learn'], parents: ['Artificial Intelligence'], category: 'data' },
  { canonical: 'Scikit-learn', aliases: ['sklearn', 'scikit learn library'], parents: ['Machine Learning', 'Python'], category: 'data' },
  { canonical: 'TensorFlow', aliases: ['tensorflow 2', 'keras'], parents: ['Deep Learning'], category: 'data' },
  { canonical: 'PyTorch', aliases: ['torch', 'pytorch lightning'], parents: ['Deep Learning'], category: 'data' },
  { canonical: 'Deep Learning', aliases: ['neural networks', 'cnn', 'rnn', 'lstm', 'transformers'], parents: ['Machine Learning'], category: 'data' },
  { canonical: 'NLP', aliases: ['natural language processing', 'text mining', 'text analytics', 'tokenization'], parents: ['Machine Learning'], category: 'data' },
  { canonical: 'Large Language Models', aliases: ['llm', 'llms', 'generative ai', 'genai', 'prompt engineering', 'rag'], parents: ['NLP'], category: 'data' },
  { canonical: 'Computer Vision', aliases: ['opencv', 'image recognition', 'object detection'], parents: ['Deep Learning'], category: 'data' },
  { canonical: 'Feature Engineering', aliases: ['feature selection', 'feature extraction'], parents: ['Machine Learning'], category: 'data' },
  { canonical: 'MLOps', aliases: ['ml ops', 'model deployment', 'ml pipelines', 'model monitoring'], parents: ['Machine Learning', 'CI/CD'], category: 'data' },
  { canonical: 'Jupyter', aliases: ['jupyter notebooks', 'notebooks', 'google colab'], parents: ['Data Analysis'], category: 'data' },

  // ---------------------------------------------------------------------- cloud
  { canonical: 'Cloud Computing', aliases: ['cloud services', 'cloud infrastructure', 'cloud native'], parents: [], category: 'cloud' },
  { canonical: 'AWS', aliases: ['amazon web services', 'aws cloud', 'ec2', 's3', 'aws lambda', 'iam'], parents: ['Cloud Computing'], category: 'cloud' },
  { canonical: 'Microsoft Azure', aliases: ['azure', 'azure cloud', 'azure functions'], parents: ['Cloud Computing'], category: 'cloud' },
  { canonical: 'Google Cloud Platform', aliases: ['gcp', 'google cloud', 'gke', 'cloud run'], parents: ['Cloud Computing'], category: 'cloud' },
  { canonical: 'Cloud Security', aliases: ['cspm', 'cloud security posture', 'cloud hardening'], parents: ['Cybersecurity', 'Cloud Computing'], category: 'cybersecurity' },
  { canonical: 'Infrastructure as Code', aliases: ['iac', 'infrastructure-as-code', 'cloudformation', 'pulumi'], parents: ['DevOps'], category: 'devops' },
  { canonical: 'Terraform', aliases: ['terraform modules', 'hcl'], parents: ['Infrastructure as Code'], category: 'devops' },
  { canonical: 'Ansible', aliases: ['ansible playbooks', 'configuration management', 'chef', 'puppet'], parents: ['DevOps'], category: 'devops' },

  // ---------------------------------------------------------------------- devops
  { canonical: 'Docker', aliases: ['containerization', 'containers', 'dockerfile', 'docker compose'], parents: ['DevOps'], category: 'devops' },
  { canonical: 'Kubernetes', aliases: ['k8s', 'container orchestration', 'eks', 'aks', 'gke'], parents: ['Docker'], category: 'devops' },
  { canonical: 'Helm', aliases: ['helm charts'], parents: ['Kubernetes'], category: 'devops' },
  { canonical: 'CI/CD', aliases: ['continuous integration', 'continuous delivery', 'continuous deployment', 'build pipelines', 'deployment pipelines'], parents: ['DevOps'], category: 'devops' },
  { canonical: 'Jenkins', aliases: ['jenkins pipelines', 'jenkinsfile'], parents: ['CI/CD'], category: 'devops' },
  { canonical: 'GitHub Actions', aliases: ['github workflows', 'gh actions'], parents: ['CI/CD'], category: 'devops' },
  { canonical: 'GitLab CI', aliases: ['gitlab pipelines', 'gitlab ci/cd'], parents: ['CI/CD'], category: 'devops' },
  { canonical: 'Git', aliases: ['github', 'gitlab', 'bitbucket', 'version control', 'source control'], parents: [], category: 'software' },
  { canonical: 'Linux', aliases: ['unix', 'ubuntu', 'debian', 'rhel', 'red hat', 'centos', 'alpine linux'], parents: [], category: 'devops' },
  { canonical: 'Monitoring', aliases: ['observability', 'alerting', 'application monitoring', 'metrics collection'], parents: ['DevOps'], category: 'devops' },
  { canonical: 'Prometheus', aliases: ['prometheus monitoring', 'promql'], parents: ['Monitoring'], category: 'devops' },
  { canonical: 'Grafana', aliases: ['grafana dashboards'], parents: ['Monitoring'], category: 'devops' },
  { canonical: 'Datadog', aliases: ['datadog apm'], parents: ['Monitoring'], category: 'devops' },
  { canonical: 'Splunk', aliases: ['spl', 'splunk enterprise'], parents: ['Monitoring'], category: 'devops' },
  { canonical: 'ELK Stack', aliases: ['elk', 'elasticsearch logstash kibana', 'kibana', 'logstash'], parents: ['Monitoring'], category: 'devops' },
  { canonical: 'OpenTelemetry', aliases: ['otel', 'distributed tracing', 'tracing', 'jaeger'], parents: ['Monitoring'], category: 'devops' },
  { canonical: 'Site Reliability Engineering', aliases: ['sre', 'reliability engineering', 'sli slo', 'error budgets'], parents: ['DevOps'], category: 'devops' },
  { canonical: 'Load Balancing', aliases: ['load balancer', 'elb', 'alb', 'traffic management'], parents: ['Networking'], category: 'devops' },
  { canonical: 'Networking', aliases: ['tcp/ip', 'dns', 'http', 'network protocols', 'routing', 'switching'], parents: [], category: 'devops' },

  // ------------------------------------------------------------------ security
  { canonical: 'Cybersecurity', aliases: ['cyber security', 'information security', 'infosec', 'security engineering'], parents: [], category: 'cybersecurity' },
  { canonical: 'Penetration Testing', aliases: ['pentest', 'pen testing', 'ethical hacking', 'offensive security', 'burp suite'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'Vulnerability Management', aliases: ['vulnerability assessment', 'vuln management', 'cve', 'patch management', 'nessus', 'qualys'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'SIEM', aliases: ['security information and event management', 'log correlation', 'splunk es', 'sentinel'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'Incident Response', aliases: ['security incident handling', 'dfir', 'threat response', 'containment'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'Threat Modeling', aliases: ['threat model', 'stride', 'attack surface analysis'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'OWASP', aliases: ['owasp top 10', 'secure coding', 'application security', 'appsec', 'sast', 'dast'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'NIST', aliases: ['nist framework', 'nist 800-53', 'nist csf', 'nist ai rmf'], parents: ['Risk Management'], category: 'cybersecurity' },
  { canonical: 'ISO 27001', aliases: ['iso27001', 'isms', 'iso 27001 certification'], parents: ['Risk Management'], category: 'cybersecurity' },
  { canonical: 'SOC 2', aliases: ['soc2', 'soc 2 type ii', 'soc 2 type i'], parents: ['Risk Management'], category: 'cybersecurity' },
  { canonical: 'GDPR', aliases: ['general data protection regulation', 'data privacy', 'ccpa', 'privacy compliance'], parents: ['Risk Management'], category: 'cybersecurity' },
  { canonical: 'HIPAA', aliases: ['hipaa compliance', 'phi protection'], parents: ['Risk Management'], category: 'cybersecurity' },
  { canonical: 'PCI DSS', aliases: ['pci-dss', 'pci compliance'], parents: ['Risk Management'], category: 'cybersecurity' },
  { canonical: 'Identity and Access Management', aliases: ['iam', 'identity management', 'rbac', 'access control', 'least privilege', 'sso', 'mfa'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'Encryption', aliases: ['cryptography', 'tls', 'ssl', 'aes', 'pki', 'hashing'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'Firewalls', aliases: ['firewall', 'waf', 'ids/ips', 'intrusion detection'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'Zero Trust', aliases: ['zero trust architecture', 'ztna'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'Risk Management', aliases: ['risk assessment', 'risk analysis', 'control assessment', 'grc'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'Security Auditing', aliases: ['security audit', 'compliance audit', 'control testing', 'evidence collection'], parents: ['Risk Management'], category: 'cybersecurity' },
  { canonical: 'Digital Forensics', aliases: ['forensics', 'evidence acquisition'], parents: ['Incident Response'], category: 'cybersecurity' },
  { canonical: 'Malware Analysis', aliases: ['reverse engineering', 'sandboxing'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'Security Awareness', aliases: ['phishing simulation', 'awareness training', 'security training'], parents: ['Cybersecurity'], category: 'cybersecurity' },
  { canonical: 'Red Team', aliases: ['red teaming', 'blue team', 'purple team'], parents: ['Offensive Security'], category: 'cybersecurity' },
  { canonical: 'Offensive Security', aliases: ['attack simulation', 'adversary emulation'], parents: ['Cybersecurity'], category: 'cybersecurity' },

  // ------------------------------------------------------------ product/business
  { canonical: 'Product Management', aliases: ['product strategy', 'product roadmap', 'product lifecycle', 'product ownership'], parents: [], category: 'product' },
  { canonical: 'Agile', aliases: ['agile methodology', 'scrum', 'kanban', 'sprints', 'scrum master', 'agile ceremonies'], parents: [], category: 'product' },
  { canonical: 'Jira', aliases: ['atlassian jira', 'jira administration'], parents: ['Agile'], category: 'product' },
  { canonical: 'Confluence', aliases: ['atlassian confluence'], parents: ['Agile'], category: 'product' },
  { canonical: 'Roadmapping', aliases: ['roadmap', 'release planning', 'backlog prioritization', 'backlog grooming'], parents: ['Product Management'], category: 'product' },
  { canonical: 'Stakeholder Management', aliases: ['stakeholder communications', 'stakeholder engagement', 'stakeholder alignment'], parents: ['Product Management'], category: 'product' },
  { canonical: 'Requirements Gathering', aliases: ['requirements analysis', 'business requirements', 'user stories', 'brd', 'acceptance criteria'], parents: ['Product Management'], category: 'product' },
  { canonical: 'User Research', aliases: ['customer research', 'usability testing', 'user interviews', 'voice of customer'], parents: ['Product Management'], category: 'product' },
  { canonical: 'Product Analytics', aliases: ['product metrics', 'kpis', 'okrs', 'funnel analysis', 'retention analysis', 'cohort analysis'], parents: ['Data Analysis', 'Product Management'], category: 'product' },
  { canonical: 'Project Management', aliases: ['program management', 'pmp', 'project planning', 'gantt', 'resource planning'], parents: [], category: 'business' },
  { canonical: 'Business Analysis', aliases: ['business process improvement', 'gap analysis', 'process mapping'], parents: ['Project Management'], category: 'business' },
  { canonical: 'Digital Marketing', aliases: ['marketing', 'campaign management', 'seo', 'sem', 'content marketing', 'google analytics'], parents: [], category: 'business' },
  { canonical: 'Sales', aliases: ['salesforce', 'crm', 'pipeline management', 'quota attainment', 'account management'], parents: [], category: 'business' },
  { canonical: 'Customer Success', aliases: ['customer support', 'client relations', 'customer service', 'csat', 'nps'], parents: [], category: 'business' },
  { canonical: 'Financial Analysis', aliases: ['financial modeling', 'financial modelling', 'dcf', 'variance analysis', 'budgeting'], parents: ['Accounting'], category: 'business' },
  { canonical: 'Accounting', aliases: ['gaap', 'bookkeeping', 'general ledger', 'accounts payable', 'accounts receivable', 'financial reporting', 'reconciliation'], parents: [], category: 'business' },
  { canonical: 'Auditing', aliases: ['internal audit', 'external audit', 'sox', 'sarbanes-oxley'], parents: ['Accounting'], category: 'business' },
  { canonical: 'Taxation', aliases: ['tax compliance', 'tax preparation', 'tax planning'], parents: ['Accounting'], category: 'business' },
  { canonical: 'Supply Chain', aliases: ['logistics', 'procurement', 'inventory management', 'vendor management'], parents: [], category: 'business' },
  { canonical: 'Lean Manufacturing', aliases: ['six sigma', 'kaizen', 'continuous improvement', '5s', 'process improvement'], parents: [], category: 'business' },
  { canonical: 'Quality Assurance', aliases: ['qa', 'quality control', 'qc', 'manual testing', 'test plans', 'defect tracking'], parents: ['Software Testing'], category: 'software' },
  { canonical: 'Clinical Research', aliases: ['clinical trials', 'patient care', 'good clinical practice', 'gcp compliance'], parents: [], category: 'professional' },
  { canonical: 'Human Resources', aliases: ['hr', 'talent acquisition', 'recruiting', 'onboarding', 'employee relations', 'payroll'], parents: [], category: 'business' },

  // --------------------------------------------------------------- testing/quality
  { canonical: 'Software Testing', aliases: ['testing', 'test automation', 'qa testing'], parents: ['Software Development'], category: 'software' },
  { canonical: 'Unit Testing', aliases: ['unit tests', 'jest', 'vitest', 'mocha', 'junit', 'pytest', 'test coverage'], parents: ['Software Testing'], category: 'software' },
  { canonical: 'Test-Driven Development', aliases: ['tdd', 'bdd', 'behavior driven development'], parents: ['Software Testing'], category: 'software' },
  { canonical: 'End-to-End Testing', aliases: ['e2e testing', 'cypress', 'playwright', 'selenium', 'puppeteer', 'integration testing'], parents: ['Software Testing'], category: 'software' },
  { canonical: 'Performance Testing', aliases: ['load testing', 'jmeter', 'k6', 'locust', 'stress testing'], parents: ['Software Testing'], category: 'software' },
  { canonical: 'Software Development', aliases: ['sdlc', 'software engineering', 'software design'], parents: [], category: 'software' },
  { canonical: 'Software Architecture', aliases: ['system design', 'solution architecture', 'design patterns', 'domain driven design'], parents: ['Software Development'], category: 'software' },

  // ---------------------------------------------------------------------- design
  { canonical: 'UI/UX Design', aliases: ['ui design', 'ux design', 'user experience', 'user interface design', 'interaction design'], parents: [], category: 'design' },
  { canonical: 'Figma', aliases: ['figma design', 'figma prototyping'], parents: ['UI/UX Design'], category: 'design' },
  { canonical: 'Adobe Creative Suite', aliases: ['photoshop', 'illustrator', 'indesign', 'adobe xd'], parents: ['UI/UX Design'], category: 'design' },
  { canonical: 'Wireframing', aliases: ['wireframes', 'prototyping', 'mockups', 'low fidelity prototypes'], parents: ['UI/UX Design'], category: 'design' },
  { canonical: 'Design Systems', aliases: ['component library', 'style guide', 'design tokens'], parents: ['UI/UX Design'], category: 'design' },

  // --------------------------------------------------------------- soft/professional
  { canonical: 'Communication', aliases: ['verbal communication', 'written communication', 'presentation skills', 'interpersonal skills'], parents: ['Professional Skills'], category: 'professional' },
  { canonical: 'Leadership', aliases: ['team leadership', 'people management', 'team management'], parents: ['Professional Skills'], category: 'professional' },
  { canonical: 'Collaboration', aliases: ['teamwork', 'cross-functional collaboration', 'cross functional', 'partnering'], parents: ['Professional Skills'], category: 'professional' },
  { canonical: 'Problem Solving', aliases: ['analytical thinking', 'critical thinking', 'troubleshooting', 'root cause analysis'], parents: ['Professional Skills'], category: 'professional' },
  { canonical: 'Time Management', aliases: ['prioritization', 'prioritisation', 'multitasking', 'organization skills'], parents: ['Professional Skills'], category: 'professional' },
  { canonical: 'Adaptability', aliases: ['flexibility', 'resilience', 'fast-paced environment'], parents: ['Professional Skills'], category: 'professional' },
  { canonical: 'Attention to Detail', aliases: ['detail oriented', 'detail-oriented', 'accuracy'], parents: ['Professional Skills'], category: 'professional' },
  { canonical: 'Documentation', aliases: ['technical writing', 'technical documentation', 'process documentation', 'knowledge base'], parents: ['Professional Skills'], category: 'professional' },
  { canonical: 'Mentoring', aliases: ['coaching', 'knowledge transfer', 'pair programming', 'onboarding new engineers'], parents: ['Leadership'], category: 'professional' },
  { canonical: 'Public Speaking', aliases: ['presentations', 'conference talks', 'speaking engagements'], parents: ['Communication'], category: 'professional' },
  { canonical: 'Negotiation', aliases: ['contract negotiation', 'vendor negotiation', 'commercial negotiation'], parents: ['Communication'], category: 'professional' },
  { canonical: 'Conflict Resolution', aliases: ['mediation', 'de-escalation'], parents: ['Communication'], category: 'professional' },
  { canonical: 'Decision Making', aliases: ['decision support', 'trade-off analysis'], parents: ['Professional Skills'], category: 'professional' },
  { canonical: 'Strategic Planning', aliases: ['strategy', 'strategic thinking', 'long-term planning'], parents: [], category: 'business' },
  { canonical: 'Professional Skills', aliases: ['soft skills', 'transferable skills'], parents: [], category: 'professional' },

  // -------------------------------------------------------------------- languages
  { canonical: 'English', aliases: ['english language', 'fluent english', 'native english'], parents: ['Human Languages'], category: 'language' },
  { canonical: 'Spanish', aliases: ['espanol', 'español', 'castilian'], parents: ['Human Languages'], category: 'language' },
  { canonical: 'Mandarin', aliases: ['chinese', 'mandarin chinese', 'cantonese'], parents: ['Human Languages'], category: 'language' },
  { canonical: 'French', aliases: ['francais', 'français'], parents: ['Human Languages'], category: 'language' },
  { canonical: 'German', aliases: ['deutsch'], parents: ['Human Languages'], category: 'language' },
  { canonical: 'Hindi', aliases: ['hindi language'], parents: ['Human Languages'], category: 'language' },
  { canonical: 'Arabic', aliases: ['arabic language'], parents: ['Human Languages'], category: 'language' },
  { canonical: 'Portuguese', aliases: ['portugues', 'português'], parents: ['Human Languages'], category: 'language' },
  { canonical: 'Japanese', aliases: ['nihongo'], parents: ['Human Languages'], category: 'language' },
  { canonical: 'Multilingual', aliases: ['bilingual', 'language proficiency'], parents: ['Human Languages'], category: 'language' },
  { canonical: 'Human Languages', aliases: ['foreign languages', 'spoken languages'], parents: [], category: 'language' },
];

// ---------------------------------------------------------------------------
// Index construction
// ---------------------------------------------------------------------------

/**
 * Normalises a raw skill string into a comparable token:
 *  - lowercases and NFKC-normalises
 *  - maps C++/C# style punctuation to words ("c++" -> "cpp")
 *  - strips ".js" and "js" suffixes ("react.js" -> "react")
 *  - drops version numbers ("python 3.11" -> "python")
 *  - collapses whitespace and punctuation
 */
export function normalizeSkill(raw: string | null | undefined): string {
  if (!raw) return '';

  let value = raw.normalize('NFKC').toLowerCase().trim();

  // Zero-width characters and unicode dashes.
  value = value.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\u2010-\u2015]/g, '-');

  // Symbol-laden technology names.
  value = value
    .replace(/c\+\+/g, 'cpp')
    .replace(/c#/g, 'csharp')
    .replace(/f#/g, 'fsharp')
    .replace(/\.net\b/g, 'dotnet')
    .replace(/node\.js/g, 'nodejs')
    .replace(/next\.js/g, 'nextjs')
    .replace(/vue\.js/g, 'vuejs')
    .replace(/react\.js/g, 'reactjs')
    .replace(/express\.js/g, 'expressjs')
    .replace(/socket\.io/g, 'socketio')
    .replace(/\.js\b/g, ' ')
    .replace(/\.ts\b/g, ' ')
    .replace(/\bv?\d+(\.\d+){0,3}\b/g, ' ');

  // Drop punctuation that carries no meaning for matching.
  value = value.replace(/[()[\]{}.,;:!?"'`/\\|@#$%^&*_+=~<>]/g, ' ');

  // Fold "reactjs" -> "react", "nodejs" -> "node" only when the base is a real word.
  value = value.replace(/\b([a-z]{3,})js\b/g, '$1');

  // Collapse whitespace.
  return value.replace(/\s+/g, ' ').trim();
}

const ALIAS_INDEX = new Map<string, SkillEntry>();

for (const entry of SKILL_DICTIONARY) {
  const keys = [entry.canonical, ...entry.aliases];
  for (const key of keys) {
    const normalized = normalizeSkill(key);
    if (!normalized) continue;
    if (!ALIAS_INDEX.has(normalized)) {
      ALIAS_INDEX.set(normalized, entry);
    }
  }
}

/** The canonical name for any alias (falls back to the trimmed input). */
export function canonicalizeSkill(raw: string | null | undefined): string {
  if (!raw) return '';
  const entry = ALIAS_INDEX.get(normalizeSkill(raw));
  return entry ? entry.canonical : raw.trim();
}

/** Dictionary entry for a raw skill string, if any. */
export function lookupSkill(raw: string | null | undefined): SkillEntry | null {
  if (!raw) return null;
  return ALIAS_INDEX.get(normalizeSkill(raw)) ?? null;
}

export function getSkillEntryByCanonical(canonical: string): SkillEntry | null {
  const normalized = normalizeSkill(canonical);
  const entry = ALIAS_INDEX.get(normalized);
  if (entry) return entry;
  return SKILL_DICTIONARY.find((candidate) => candidate.canonical.toLowerCase() === canonical.toLowerCase()) ?? null;
}

/** Parent concepts for a raw skill (used for related-skill credit and evidence search). */
export function skillParents(raw: string): string[] {
  return lookupSkill(raw)?.parents ?? [];
}

/**
 * STRONG_RELATED detection: same canonical concept, direct parent/child link, or
 * a shared parent concept. Alias hits are handled by `canonicalizeSkill` equality.
 */
export function areRelatedSkills(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;

  const normalizedA = normalizeSkill(a);
  const normalizedB = normalizeSkill(b);
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;

  const entryA = ALIAS_INDEX.get(normalizedA) ?? null;
  const entryB = ALIAS_INDEX.get(normalizedB) ?? null;
  if (!entryA || !entryB) return false;
  if (entryA.canonical === entryB.canonical) return true;

  const aCanon = normalizeSkill(entryA.canonical);
  const bCanon = normalizeSkill(entryB.canonical);

  const aParents = entryA.parents.map((parent) => normalizeSkill(parent));
  const bParents = entryB.parents.map((parent) => normalizeSkill(parent));

  // Direct parent/child in either direction.
  if (aParents.includes(bCanon) || bParents.includes(aCanon)) return true;

  // Sibling relation: a shared parent concept that is itself a dictionary entry.
  for (const parent of aParents) {
    if (!bParents.includes(parent)) continue;
    if (ALIAS_INDEX.has(parent)) return true;
  }

  return false;
}

/** Convenience: canonical concept plus all alias spellings (for evidence search). */
export function searchTermsForSkill(raw: string): string[] {
  const entry = lookupSkill(raw);
  if (!entry) {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
  return uniqueNonEmpty([entry.canonical, ...entry.aliases]);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export const SKILL_DICTIONARY_SIZE = SKILL_DICTIONARY.length;
export const SKILL_ALIAS_COUNT = ALIAS_INDEX.size;

export function getSkillCategory(raw: string): SkillCategory | null {
  return lookupSkill(raw)?.category ?? null;
}

/** All canonical skills for a category -- used by the UI skill filter. */
export function skillsByCategory(category: SkillCategory): SkillEntry[] {
  return SKILL_DICTIONARY.filter((entry) => entry.category === category);
}
