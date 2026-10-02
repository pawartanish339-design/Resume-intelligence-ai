/**
 * Common-English + professional/technical word set.
 *
 * Purpose: `assessExtractionQuality()` needs a cheap, deterministic signal that a
 * document produced *real words* rather than symbol soup (broken CID fonts,
 * scrambled encodings, OCR garbage). It is intentionally a plain word list -- no
 * stemming dictionary, no network access, no locale data.
 *
 * The list is deliberately broad (common English + software/data/cloud/security/
 * business/education vocabulary) so that legitimate resumes score well and
 * garbage does not. Tokens are compared case-insensitively.
 *
 * NOTE: this is a heuristic aid, never a scoring input on its own. Used in
 * combination with character count and whitespace distribution.
 */

const COMMON_ENGLISH = `
the of and to in a is that for it as with was on be at by this are or from an not have has had
were which you your we they he she his her its our their them they're i me my mine us
will would can could should may might must shall do does did done doing been being am
there here where when while who whom whose what why how whether than then thus
about above across after against along among around at before behind below beneath beside between
beyond during except for from inside into near off onto out outside over past since through
throughout till toward towards under underneath until up upon within without
all any both each either every few many more most much neither no none other others several some such
one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty sixty
seventy eighty ninety hundred thousand million billion first second third fourth fifth last next
again further once only also just even still yet already always never often sometimes usually
very too quite rather fairly really almost nearly enough less least well better best worse worst
because although though unless whereas therefore however moreover furthermore nevertheless otherwise
instead meanwhile besides accordingly consequently specifically particularly generally typically
approximately including e.g i.e etc via per vs non among amongst towards
yes no maybe perhaps certainly definitely clearly obviously simply actually basically essentially
above all in addition in order to as well as such as due to based on rather than instead of
able about above across add after again against age ago agree ahead allow almost alone along already
although always among amount another answer any anyone anything appear apply area argue arm around
arrive art article artist ask assume attack attention author available avoid away baby back bad bag
ball bank bar base be beat beautiful because become bed before begin behavior behind believe benefit
best better between beyond big bill billion bit black blood blue board body book born both box boy
break bring brother build building business but buy call camera campaign can candidate capital car
card care career carry case catch cause cell center central century certain chair challenge chance
change character charge check child choice choose church city civil claim class clear client climate
close coach cold collection college color come commercial common community company compare computer
concern condition conference consider consumer contain continue contract control cost could country
county couple course court cover create crime cultural culture current customer cut dark data daughter
day dead deal death debate decade decide decision deep defense degree democratic describe design
despite detail determine develop development die difference different difficult dinner direction
director discover discuss disease doctor door down draw dream drive drop drug during each early east
easy eat economic economy edge education effect effort eight either election electric else employee
end energy enjoy enough enter entire environment environmental especially establish even evening event
ever every everybody everyone everything evidence exactly example executive exist expect experience
expert explain eye face fact factor fail fall family far fast father fear federal feel feeling field
fight figure fill film final finally financial find fine finger finish fire firm first fish five floor
fly focus follow food foot force foreign forget form former forward four free friend front full fund
future game garden gas general generation girl give glass global goal good government great green
ground group grow growth guess gun guy hair half hand hang happen happy hard have head health hear
heart heat heavy help her here herself high him himself his history hit hold home hope hospital hot
hotel hour house how however huge human hundred husband identify image imagine impact important
improve include increase indeed indicate individual industry information inside instead institution
interest interesting international interview into investment involve issue item its itself job join
just keep key kid kill kind kitchen know knowledge land language large last late later laugh law lawyer
lay lead leader learn least leave left leg legal less let letter level lie life light like likely line
list listen little live local long look lose loss lot love low machine magazine main maintain major
make man manage management manager many market marriage material matter may maybe mean measure media
medical meet meeting member memory mention message method middle might military million mind minute
miss mission model modern moment money month moral morning mother mouth move movement movie much music
must my myself name nation national natural nature near nearly necessary need network never new news
newspaper next nice night none nor north not note nothing notice now number occur off offer office
officer official often oil once one only open operation opportunity option order organization other
others our out outside over own owner page pain painting paper parent part participant particular
particularly partner party pass past patient pattern peace people per perform performance perhaps
period person personal phone physical pick picture piece place plan plant play player point police
policy political politics poor popular population position positive possible power practice prepare
present president pressure pretty prevent price private probably problem process produce product
production professional professor program project property protect prove provide public purpose push
put quality question quickly quiet quite race radio raise range rate rather reach read ready real
reality realize really reason receive recent recently recognize record red reduce reflect region
relate relationship religious remain remember remove repeat replace report represent require research
resource respond response responsibility rest result return reveal rich right rise risk road rock role
room rule run safe same save say scene school science scientist score sea season seat second section
security see seek seem sell send senior sense series serious serve service set seven several sex shake
share she shoot short shot should shoulder show side sign significant similar simple simply since sing
single sister sit site situation six size skill skin small smile so social society soldier some
somebody someone something sometimes son song soon sort sound source south space speak special specific
speech spend sport spring staff stage stand standard star start state statement station stay step still
stock stop store story strategy street strong structure student study stuff style subject success
successful such suddenly suffer suggest summer support sure surface system table take talk task tax
teach teacher team technology television tell ten tend term test than thank that the their them
themselves then theory there these they thing think third this those though thought thousand threat
three through throughout throw thus time to today together tonight too top total tough toward town
trade traditional training travel treat treatment tree trial trip trouble true truth try turn two type
under understand unit until up upon use usually value various very victim view violence visit voice
vote wait walk wall want war watch water way we weapon wear week weight well west western what whatever
when where whether which while white who whole whom whose why wide wife wild will win wind window wish
with within without woman wonder word work worker world worry would write writer wrong yard yeah year
yes yet you young your yourself
`;

const BUSINESS_AND_RESUME = `
resume curriculum vitae cv cover letter candidate applicant recruiter hiring recruitment onboarding
interview portfolio linkedin github website references referee referee recommendation testimonial
objective summary profile headline accomplishments achievements qualification qualifications
competency competencies expertise proficiency proficient adept familiarity knowledgeable
certification certificate certified licensure license credential accredited accredited
career professional vocational internship intern apprentice trainee fellowship scholarship
employment employer employee workforce staffing consultancy contractor freelance part-time full-time
compensation salary wage benefits bonus equity pension payroll
collaborate collaboration cross-functional stakeholder stakeholders client clients vendor vendors
deliverable deliverables milestone milestones roadmap roadmap initiative initiatives
kpi kpis metrics okr okrs objective key results benchmark benchmarks target attainment
stakeholder communication presentation presentations report reporting dashboard briefing memo
negotiation negotiation facilitation workshop training mentoring coaching mentoring mentorship
leadership ownership autonomy initiative proactive self-starter dependable reliable
results-driven detail-oriented deadline multitasking prioritization prioritisation
stakeholders escalations escalation risk mitigation contingency
revenue profitability margin budget budgeting forecast forecasting variance
cost savings efficiency productivity throughput utilization utilization optimisation
compliance regulatory governance audit auditing policy procedure procedure documentation
nda confidentiality intellectual property patent trademark
proposal tender procurement supplier inventory logistics vendor
stakeholder management lifecycle roadmap strategy tactics execution rollout
startup enterprise sme organisation organization department division branch subsidiary
headquarters regional global domestic international offshore nearshore
b2b b2c saas paas iaas subscription churn retention acquisition funnel conversion
conversion rate engagement impression click-through seo sem crm erp sap salesforce hubspot
marketing campaign branding positioning segmentation persona
sales pipeline quota prospect lead opportunity closing deal
customer support helpdesk ticket sla escalation satisfaction nps csat
`;

const SOFTWARE_ENGINEERING = `
software engineer developer programmer programming coding codebase repository repo commit branch merge
pull request code review refactor refactoring architecture design pattern monolith microservice
microservices serverless frontend backend fullstack full-stack api rest restful graphql grpc rpc
endpoint endpoints middleware controller service repository model schema migration seeding
javascript typescript python java golang rust ruby php csharp c-sharp kotlin swift scala perl
elixir erlang haskell lua dart objective-c visual basic vbnet fsharp
react reactjs nextjs next.js angular vue svelte sveltekit solidjs remix astro
redux mobx zustand recoil context hooks state management
html html5 css css3 sass scss less stylus tailwind tailwindcss bootstrap material-ui chakra
responsive accessibility a11y aria wcag semantics progressive web app pwa spa
node nodejs deno bun express nestjs fastify koa hapi django flask fastapi spring springboot
rails laravel symfony phoenix aspnet dotnet net-core
graphql apollo trpc prisma sequelize typeorm knex mongoose sqlalchemy hibernate jpa
postgres postgresql mysql mariadb sqlite oracle mssql sqlserver mongodb dynamodb firestore
cassandra redis memcached elasticsearch opensearch neo4j influxdb clickhouse snowflake
bigquery redshift databricks hive presto athena
kafka rabbitmq sqs sns pubsub nats zeromq activemq event-driven messaging queue stream
jest vitest mocha chai jasmine karma cypress playwright selenium puppeteer testing-library
unit testing integration testing end-to-end e2e regression smoke load performance testing
tdd bdd coverage mocking stubbing fixtures assertions
git github gitlab bitbucket svn mercurial version control branching rebasing cherry-pick
ci cd continuous integration continuous delivery deployment pipeline jenkins circleci travis
github actions gitlab-ci argocd spinnaker tekton buildkite
docker container containerization kubernetes k8s helm istio linkerd service mesh
terraform pulumi cloudformation ansible chef puppet vagrant
aws azure gcp google-cloud oracle-cloud ibm-cloud digitalocean linode heroku vercel netlify
ec2 s3 lambda rds dynamodb cloudfront route53 iam cloudwatch sqs kinesis fargate eks ecs
blob storage functions app service cosmos db vm virtual machine vpc subnet
linux unix ubuntu debian centos rhel alpine fedora arch macos windows bsd shell
bash zsh powershell scripting automation cron systemd nginx apache tomcat haproxy traefik
compiler interpreter runtime virtual machine bytecode memory management garbage collection
pointer threading concurrency parallelism asynchronous async await promise callback event loop
deadlock race condition mutex semaphore locking atomic transactional
algorithm algorithms data structure structures complexity big-o optimization
recursion iteration sorting searching hashing caching memoization dynamic programming
object-oriented functional reactive procedural declarative imperative
api design idempotency pagination rate limiting versioning backward compatibility
debugging troubleshooting profiling benchmarking instrumentation tracing logging observability
datadog newrelic grafana prometheus loki jaeger opentelemetry splunk elk
monitoring alerting incident incident response postmortem root cause on-call
mobile ios android react-native flutter ionic xamarin swiftui jetpack-compose
web game unity unreal opengl webgl threejs canvas
embedded firmware arduino raspberry microcontroller rtos iot
compiler build webpack vite rollup esbuild babel swc parcel turbo nx bazel gradle maven
npm yarn pnpm package dependencies semver lockfile
performance optimization latency throughput caching cdn load balancing scaling horizontal vertical
code quality linting formatting prettier eslint sonarqube static analysis code smell
technical debt legacy modernization greenfield brownfield feature flag canary blue-green
documentation readme swagger openapi jsdoc confluence wiki
agile scrum kanban sprint backlog standup retrospective grooming estimation story points
jira asana trello linear monday notion
open source contribution maintainer upstream fork patch
pair programming code pairing mob programming mentoring code review
`;

const DATA_AND_ANALYTICS = `
data analyst analytics scientist science engineer engineering pipeline etl elt extract transform load
warehouse lakehouse lake data mart ingestion batch streaming real-time near-real-time
statistics statistical probability distribution mean median mode variance standard deviation
correlation regression classification clustering segmentation prediction forecasting time-series
hypothesis testing significance p-value confidence interval sample population outlier anomaly
a b testing experimentation ab-test control group cohort
machine learning deep learning neural network supervised unsupervised reinforcement
model training validation testing inference feature engineering hyperparameter tuning cross-validation
overfitting underfitting accuracy precision recall f1 roc auc confusion matrix
regression logistic random forest decision tree gradient boosting xgboost lightgbm catboost
svm naive bayes kmeans pca dimensionality reduction nlp natural language processing
computer vision convolutional recurrent transformer attention embedding tokenisation
tensorflow pytorch keras scikit-learn sklearn pandas numpy scipy matplotlib seaborn plotly
statsmodels xgboost spark pyspark hadoop mapreduce hive pig flink beam
sql nosql query queries joins aggregation window function stored procedure index optimisation
tableau powerbi power-bi looker qlik dax mdx excel spreadsheet pivot vlookup
visualization dashboard storytelling insights narrative
dbt airflow dagster prefect luigi orchestrator lineage catalog governance quality
metadata data dictionary schema registry master data reference data
big data volume velocity variety veracity parquet avro orc json csv xml yaml
dimensional modeling star schema snowflake schema fact dimension surrogate key
olap oltp transactional analytical
kpi metric measure dimension granularity cohort retention churn lifetime value
`;

const CLOUD_DEVOPS_SECURITY = `
devops sre site reliability engineer platform infrastructure cloud native
provisioning orchestration autoscaling elasticity high availability fault tolerance redundancy
disaster recovery backup restore replication failover
networking tcp ip udp http https dns dhcp vpn nat firewall proxy reverse-proxy load-balancer
subnet cidr routing switching latency bandwidth packet protocol
tls ssl certificate encryption decryption hashing salting symmetric asymmetric public private key
authentication authorization identity access management oauth oauth2 openid saml sso mfa 2fa
rbac acl principle of least privilege zero trust
vulnerability vulnerabilities exploit malware ransomware phishing social engineering
penetration testing pentest red team blue team purple team threat modeling
siem soar ids ips waf ddos mitigation
owasp xss csrf sql-injection injection ssrf idor directory traversal privilege escalation
cve cvss patching remediation hardening hardening baseline
forensics incident handling breach disclosure notification
encryption at rest in transit key management kms vault secrets rotation
compliance framework: soc2 soc-2 iso27001 iso-27001 pci-dss hipaa gdpr ccpa fedramp nist
nist-ai-rmf risk assessment control mapping evidence
security awareness training tabletop exercise business continuity
container security image scanning supply chain sbom provenance signing
kubernetes security contexts network policies pod security admission control
logging audit trail retention immutable tamper-evident
`;

const DOMAINS_AND_ACADEMICS = `
university college institute school faculty department campus alumnus alumni graduate undergraduate
bachelor master masters doctorate doctoral phd mba bsc bscs ba bs msc ms meng mengg mphil
degree diploma certificate transcript gpa honours honors magna cum laude dean list
coursework curriculum syllabus semester trimester quarter credits thesis dissertation capstone
research publication journal conference proceedings citation peer-reviewed preprint
lecturer professor instructor teaching assistant tutor advisor supervisor
course subject module assignment examination exam quiz laboratory seminar lecture
finance accounting economics banking investment portfolio asset liability equity derivative
audit tax reconciliation ledger invoice accounts payable receivable
healthcare clinical patient diagnosis treatment therapy nursing physician hospital
pharmacy biomedical pharmaceutical regulatory fda clinical-trials
law legal litigation contract compliance counsel paralegal statute regulation
education pedagogy curriculum instruction assessment accreditation
manufacturing production quality assurance qa qc lean six-sigma kaizen supply-chain
construction civil mechanical electrical chemical industrial aerospace automotive
energy oil gas renewable solar wind utilities power-grid
retail ecommerce logistics fulfillment warehouse distribution
hospitality tourism hotel restaurant food beverage
media journalism broadcasting publishing editorial content
designer design ux ui interaction visual graphic typography wireframe prototype usability
figma sketch adobe photoshop illustrator indesign xd canva invision
human resources talent acquisition payroll benefits employee-relations
sales marketing customer-success account-management
nonprofit ngo volunteer community outreach fundraising grant
government public-sector municipal federal agency defense military veteran
aviation maritime agriculture mining telecommunications
`;

const COUNTRIES_AND_PLACES = `
united states america american canada canadian mexico mexican brazil brazilian argentina chile
peru colombia venezuela uruguay ecuador bolivia
united kingdom british england scotland wales northern ireland ireland irish
france french germany german spain spanish italy italian portugal portuguese netherlands dutch
belgium switzerland swiss austria austrian sweden swedish norway norwegian denmark danish
finland finnish iceland poland polish czech slovakia hungary romania bulgaria greece greek
croatia serbia slovenia ukraine ukrainian russia russian turkey turkish
israel israeli egypt egyptian morocco algeria tunisia nigeria kenyan kenya ghana ethiopia
south africa african uganda tanzania zimbabwe senegal
china chinese japan japanese korea korean india indian pakistan pakistani bangladesh sri-lanka
nepal thailand thai vietnam vietnamese malaysia malaysian singapore indonesia indonesian
philippines filipino australia australian new zealand zealand fiji
saudi arabia emirates uae dubai qatar kuwait bahrain oman jordan lebanon iraq iran
cities: london paris berlin madrid rome amsterdam brussels vienna zurich stockholm oslo
copenhagen helsinki dublin lisbon prague warsaw budapest athens istanbul moscow kyiv
new-york york boston chicago seattle austin denver atlanta miami dallas houston phoenix
portland toronto vancouver montreal ottawa calgary
san-francisco francisco jose angeles angeles diego vegas philadelphia detroit minneapolis
bengaluru bangalore mumbai delhi hyderabad chennai pune kolkata noida gurgaon
tokyo osaka beijing shanghai shenzhen hong-kong taipei seoul busan
singapore bangkok jakarta manila hanoi saigon kuala-lumpur
sydney melbourne brisbane perth auckland wellington
sao-paulo rio-janeiro buenos-aires santiago lima bogota
cairo lagos nairobi johannesburg cape-town casablanca
`;

const MONTHS_AND_TIME = `
monday tuesday wednesday thursday friday saturday sunday week weekend weekday
january february march april may june july august september october november december
jan feb mar apr jun jul aug sep sept oct nov dec
morning afternoon evening night midnight noon today tomorrow yesterday
daily weekly biweekly monthly quarterly annually yearly hourly
spring summer autumn fall winter seasonal fiscal
second minute hour day week fortnight month quarter semester year decade
immediately ongoing present current recent upcoming previous prior
`;

const TECH_AND_WEB = `
internet intranet extranet browser chrome firefox safari edge chromium webkit gecko
http https url uri uri slug permalink cookie session cache cdn domain hosting
json xml soap websocket webrtc webhook polling long-polling server-sent events
html css javascript wasm webassembly
seo ranking crawl indexing sitemap robots canonical
analytics tracking pixel tag manager utm
email smtp imap pop3 newsletter notification push
mobile app store playstore apk ipa
authentication login logout signin signup password username
accessibility screen-reader keyboard-navigation contrast
internationalization localization i18n l10n translation locale
performance lighthouse core-web-vitals lazy-loading code-splitting tree-shaking minification
security headers csp cors same-origin csrf-token
microfrontend islands hydration ssr ssg isr static dynamic edge-runtime nodejs-runtime
`;

/**
 * Flatten all groups into a single lowercase Set.
 * Duplicates across groups are harmless (Set semantics) and keep the source readable.
 */
function buildWordSet(): Set<string> {
  const groups = [
    COMMON_ENGLISH,
    BUSINESS_AND_RESUME,
    SOFTWARE_ENGINEERING,
    DATA_AND_ANALYTICS,
    CLOUD_DEVOPS_SECURITY,
    DOMAINS_AND_ACADEMICS,
    COUNTRIES_AND_PLACES,
    MONTHS_AND_TIME,
    TECH_AND_WEB,
  ];

  const words = new Set<string>();
  for (const group of groups) {
    for (const rawToken of group.split(/\s+/)) {
      const token = rawToken.trim().toLowerCase();
      if (!token) continue;
      // Strip the "prefix:" labels used for readability in a couple of groups.
      const cleaned = token.replace(/:$/, '');
      if (!cleaned) continue;
      if (!/^[a-z][a-z'’\-.]*$/.test(cleaned)) continue;
      words.add(cleaned);
      // Also index hyphenated compounds by their parts ("full-stack" -> full, stack).
      if (cleaned.includes('-')) {
        for (const part of cleaned.split('-')) {
          if (part.length > 2) words.add(part);
        }
      }
    }
  }
  return words;
}

export const COMMON_WORDS: ReadonlySet<string> = buildWordSet();

/** Minimum word-list size guaranteed by the unit test in tests/unit/wordlist.test.ts. */
export const WORDLIST_SIZE = COMMON_WORDS.size;

/** Light normalisation mirroring the tokeniser used by the quality checks. */
export function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/^[^a-z]+/, '')
    .replace(/[^a-z'’]+$/, '')
    .replace(/['’]s$/, '');
}

export function isDictionaryWord(token: string): boolean {
  const normalized = normalizeToken(token);
  if (!normalized || normalized.length < 2) return false;
  if (COMMON_WORDS.has(normalized)) return true;
  // Simple morphological tolerance: plurals and common suffixes.
  if (normalized.endsWith('s') && COMMON_WORDS.has(normalized.slice(0, -1))) return true;
  if (normalized.endsWith('es') && COMMON_WORDS.has(normalized.slice(0, -2))) return true;
  if (normalized.endsWith('ing') && COMMON_WORDS.has(normalized.slice(0, -3))) return true;
  if (normalized.endsWith('ed') && COMMON_WORDS.has(normalized.slice(0, -2))) return true;
  if (normalized.endsWith('ly') && COMMON_WORDS.has(normalized.slice(0, -2))) return true;
  return false;
}

/**
 * Tokens worth judging: alphabetic runs of >= 2 characters. Numbers, punctuation
 * and single letters are ignored (they carry no signal about text integrity).
 */
export function extractAlphabeticTokens(text: string): string[] {
  const matches = text.match(/[A-Za-z][A-Za-z'’\-]{1,}/g);
  return matches ? matches.map((token) => token.toLowerCase()) : [];
}

/**
 * Share of alphabetic tokens that are recognisable words (0..1).
 * Returns 0 for text with no usable tokens.
 */
export function dictionaryWordRatio(text: string): number {
  const tokens = extractAlphabeticTokens(text);
  if (tokens.length === 0) return 0;
  let known = 0;
  for (const token of tokens) {
    if (isDictionaryWord(token)) known += 1;
  }
  return known / tokens.length;
}
