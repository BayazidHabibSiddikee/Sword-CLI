#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

cat >"$tmpdir/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${GH_TEST_LOG:?}"

if [ "${GH_TEST_MODE:-}" = producer-failure ] && [ "$1 $2" = 'run list' ]; then
  printf '%s\n' '[]'
  echo 'mock run producer failed' >&2
  exit 37
fi
if [ "${GH_TEST_MODE:-}" = required-fetch-failure ] && [ "$1 $2" = 'api graphql' ]; then
  echo 'mock closed-item fetch failed' >&2
  exit 38
fi
if [ "${GH_TEST_MODE:-}" = malformed-input ] && [ "$1 $2" = 'pr list' ]; then
  printf '%s\n' '{malformed'
  exit 0
fi
if [ "${GH_TEST_MODE:-}" = volume ]; then
  case "$1 $2" in
    'run list') cat "${GH_TEST_FIXTURES:?}/runs.json" ;;
    'pr list') cat "${GH_TEST_FIXTURES:?}/pulls.json" ;;
    'api repos/test/target/issues/comments'*) cat "${GH_TEST_FIXTURES:?}/comments.json" ;;
    'api graphql') cat "${GH_TEST_FIXTURES:?}/closed.json" ;;
    'api repos/test/sweeper/actions/runs?status='*) printf '%s\n' '[]' ;;
    'api repos/test/sweeper/contents/config/automation-limits.json'*) printf '%s\n' '{}' ;;
    *) echo "unexpected volume gh call: $*" >&2; exit 1 ;;
  esac
  exit 0
fi

case "$1 $2" in
  "run list")
    printf '%s\n' '[{"databaseId":11,"name":"Sweep","status":"completed","conclusion":"failure","createdAt":"2099-01-01T00:00:00Z","url":"https://github.test/runs/11"}]'
    ;;
  "run view")
    case "$3" in
      21)
        printf '%s\n' '[{"name":"opaque worker","status":"in_progress","conclusion":null,"steps":["Run setup-codex"]},{"name":"intake","status":"in_progress","conclusion":null,"steps":[]},{"name":"Retry failed Codex reviews","status":"in_progress","conclusion":null,"steps":[]},{"name":"Publish","status":"in_progress","conclusion":null,"steps":[]}]'
        ;;
      22)
        printf '%s\n' '[{"name":"Review commit abc","status":"queued","conclusion":null,"steps":[]}]'
        ;;
      24)
        printf '%s\n' '[{"name":"intake","status":"requested","conclusion":null,"steps":[]}]'
        ;;
      25)
        printf '%s\n' '[{"name":"Review, comment, and apply event item","status":"in_progress","conclusion":null,"steps":[]}]'
        ;;
      26)
        printf '%s\n' '[{"name":"Review shard 1","status":"in_progress","conclusion":null,"steps":[]},{"name":"Review shard 2","status":"in_progress","conclusion":null,"steps":[]}]'
        ;;
      *)
        echo "unexpected run view: $*" >&2
        exit 1
        ;;
    esac
    ;;
  "pr list")
    printf '%s\n' '[{"title":"Generated repair","url":"https://github.test/pull/7","mergedAt":"2099-01-01T00:00:00Z","mergedBy":{"login":"maintainer"},"labels":[]}]'
    ;;
  "api repos/test/target/issues/comments"*)
    if [[ "$*" == *"per_page=20"* ]]; then
      echo "github_response_too_large" >&2
      exit 1
    fi
    printf '%s\n' '[{"user":{"login":"clawsweeper"},"body":"Codex review: clean","html_url":"https://github.test/comment/8","issue_url":"https://api.github.test/issues/8"}]'
    ;;
  "api repos/test/sweeper/contents/config/automation-limits.json"*)
    printf '%s\n' '{"workers":{"max":128},"lanes":{"exact_review":{"max_concurrent":28,"target_max_concurrent":24}}}'
    ;;
  "api repos/test/sweeper/actions/runs?status=in_progress&per_page=12")
    printf '%s\n' '[{"databaseId":21,"name":"ClawSweeper review","event":"workflow_dispatch","status":"in_progress","conclusion":null,"createdAt":"2099-01-01T00:00:00Z","url":"https://github.test/runs/21"},{"databaseId":25,"name":"Review event item test/target#25","event":"repository_dispatch","status":"in_progress","conclusion":null,"createdAt":"2099-01-01T00:00:00Z","url":"https://github.test/runs/25"},{"databaseId":26,"name":"Review event items test/target#26,27 [shards=2]","event":"workflow_dispatch","status":"in_progress","conclusion":null,"createdAt":"2099-01-01T00:00:00Z","url":"https://github.test/runs/26"}]'
    ;;
  "api repos/test/sweeper/actions/runs?status=queued&per_page=12")
    printf '%s\n' '[{"databaseId":22,"name":"ClawSweeper review","status":"queued","conclusion":null,"createdAt":"2099-01-01T00:00:00Z","url":"https://github.test/runs/22"}]'
    ;;
  "api repos/test/sweeper/actions/runs?status=pending&per_page=12")
    printf '%s\n' '[{"databaseId":23,"name":"ClawSweeper review","status":"pending","conclusion":null,"createdAt":"2099-01-01T00:00:00Z","url":"https://github.test/runs/23"}]'
    ;;
  "api repos/test/sweeper/actions/runs?status=requested&per_page=12")
    printf '%s\n' '[{"databaseId":24,"name":"repair commit finding intake","status":"requested","conclusion":null,"createdAt":"2099-01-01T00:00:00Z","url":"https://github.test/runs/24"}]'
    ;;
  "api repos/test/sweeper/actions/runs?status=failure&per_page=12")
    printf '%s\n' '[{"databaseId":11,"name":"Sweep","status":"completed","conclusion":"failure","createdAt":"2099-01-01T00:00:00Z","url":"https://github.test/runs/11"}]'
    ;;
  "api repos/test/sweeper/actions/runs?status="*)
    printf '%s\n' '[]'
    ;;
  "api graphql")
    printf '%s\n' '{"data":{"pulls":{"nodes":[{"title":"Closed pull request","url":"https://github.test/pull/9","closedAt":"2099-01-01T00:00:00Z","timelineItems":{"nodes":[{"createdAt":"2099-01-01T00:00:00Z","actor":{"login":"clawsweeper"}}]}}]},"issues":{"nodes":[{"title":"Fixed issue","url":"https://github.test/issues/9","closedAt":"2099-01-01T00:00:00Z","timelineItems":{"nodes":[{"createdAt":"2099-01-01T00:00:00Z","actor":{"login":"clawsweeper"}}]}}]}}}'
    ;;
  *)
    echo "unexpected gh call: $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$tmpdir/gh"

cat >"$tmpdir/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${CURL_TEST_LOG:?}"
if [ "${CURL_TEST_MODE:-}" = "fail" ]; then
  exit 22
fi
cat "${CURL_TEST_FIXTURE:?}"
EOF
chmod +x "$tmpdir/curl"

# Fail the workflow renderer itself, so an ignored jq error cannot pass as truncation.
export JQ_TEST_REAL
JQ_TEST_REAL="$(command -v jq)"
cat >"$tmpdir/jq" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ "${JQ_TEST_MODE:-}" = renderer-failure ] && [[ "$*" == *'group_by(.name)'* ]]; then
  exec "$JQ_TEST_REAL" -n 'error("mock workflow renderer failed")'
fi
exec "$JQ_TEST_REAL" "$@"
EOF
chmod +x "$tmpdir/jq"

export GH_TEST_LOG="$tmpdir/gh.log"
export CURL_TEST_LOG="$tmpdir/curl.log"
public_fixture="$script_dir/fixtures/public-exact-review-queue.json"
printf '%s\n' '{"pending":2,"dispatching":3,"leased":5,"target_stats":[{"target_repo":"test/target","pending":1,"dispatching":2,"leased":4}]}' >"$tmpdir/legacy.json"
jq '. + {target_stats: [{target_repo: "test/target", pending: 1, dispatching: 2, leased: 4}], oldest_pending_key: "test/target#42"}' \
  "$public_fixture" >"$tmpdir/full.json"

assert_contains() {
  if ! grep -Fq -- "$1" "$2"; then
    printf 'FAIL [%s]: expected %s in %s\n' "$test_case" "$1" "$2" >&2
    cat "$2" >&2
    exit 1
  fi
}

assert_not_contains() {
  if grep -Fq -- "$1" "$2"; then
    printf 'FAIL [%s]: unexpected %s in %s\n' "$test_case" "$1" "$2" >&2
    cat "$2" >&2
    exit 1
  fi
}

run_case() {
  test_case="$1"
  : >"$GH_TEST_LOG"
  : >"$CURL_TEST_LOG"
  CURL_TEST_FIXTURE="$2" CURL_TEST_MODE="${3:-}" PATH="$tmpdir:$PATH" \
    bash "$script_dir/clawsweeper-status.sh" \
    --repo test/target \
    --clawsweeper-repo test/sweeper \
    --hours 1 \
    --limit "${TEST_LIMIT:-8}" \
    --run-limit "${TEST_RUN_LIMIT:-12}" >"$tmpdir/output" 2>"$tmpdir/error" || {
      result=$?
      printf 'FAIL [%s]: status script exited %s\n' "$test_case" "$result" >&2
      cat "$tmpdir/error" >&2
      exit 1
    }
  # Exact arguments also reject authentication headers, credentials, or extra requests.
  expected_request="--fail --silent --show-error --connect-timeout 3 --max-time 8 ${CLAWSWEEPER_EXACT_REVIEW_QUEUE_URL:-https://clawsweeper.openclaw.ai}/api/exact-review-queue"
  if [ "$(cat "$CURL_TEST_LOG")" != "$expected_request" ]; then
    printf 'FAIL [%s]: queue request must remain unauthenticated and bounded\n' "$test_case" >&2
    exit 1
  fi
  assert_not_contains 'run view 23' "$GH_TEST_LOG"
  if grep -Eq 'actions/runs($| )|per_page=100|pulls\?state=closed' "$GH_TEST_LOG"; then
    printf 'FAIL [%s]: broad GitHub payload query detected\n' "$test_case" >&2
    exit 1
  fi
}

assert_queue_jobs() {
  assert_contains '- Active Codex jobs: 8/128 running, 2 queued' "$tmpdir/output"
  assert_not_contains 'run view 25' "$GH_TEST_LOG"
  assert_contains 'run view 26' "$GH_TEST_LOG"
}

assert_unavailable() {
  assert_contains '- Exact-review queue: unavailable' "$tmpdir/output"
  assert_contains '- Active Codex jobs: 4/128 running, 2 queued' "$tmpdir/output"
  assert_contains 'run view 25' "$GH_TEST_LOG"
  assert_contains 'run view 26' "$GH_TEST_LOG"
  assert_not_contains '- Queue health:' "$tmpdir/output"
  assert_not_contains '- Publication tail:' "$tmpdir/output"
}

assert_health() {
  assert_contains '- Queue backoff: throttle_retry 5, review_retry 2' "$tmpdir/output"
  assert_contains '- Queue parked (needs operator): review_retry_exhausted 3' "$tmpdir/output"
  assert_contains '- Shed since reset: 17' "$tmpdir/output"
  assert_contains '- Publication tail: 11 pending, 7 ready, 4 backoff, 2 parked, 1/6 active' "$tmpdir/output"
  assert_contains '- Publication backoff: publication_retry 4' "$tmpdir/output"
  assert_contains '- Publication parked (needs operator): dispatch_rejected 2' "$tmpdir/output"
  assert_not_contains 'throttle_retry 0' "$tmpdir/output"
}

run_case legacy "$tmpdir/legacy.json"

grep -Fq -- '- Active workflow runs: 6' "$tmpdir/output"
grep -Fq -- '- Queued/waiting workflow runs: 2' "$tmpdir/output"
grep -Fq -- '- Workflow concurrency waiters: 1' "$tmpdir/output"
grep -Fq -- '- Failed/timed-out/action-required recent runs: 1' "$tmpdir/output"
grep -Fq -- '- Active Codex jobs: 8/128 running, 2 queued' "$tmpdir/output"
grep -Fq -- '- Exact-review queue: 8/28 active, 2 pending (target test/target: 6/24 active, 1 pending)' "$tmpdir/output"
grep -Fq 'https://github.test/pull/7' "$tmpdir/output"
grep -Fq 'https://github.test/comment/8' "$tmpdir/output"
grep -Fq 'https://github.test/pull/9' "$tmpdir/output"
grep -Fq 'https://github.test/issues/9' "$tmpdir/output"
grep -Fq 'run list --repo test/sweeper --limit 12 --json' "$GH_TEST_LOG"
grep -Fq 'api repos/test/sweeper/actions/runs?status=failure&per_page=12 --jq' "$GH_TEST_LOG"
grep -Fq 'issues/comments?sort=updated&direction=desc&per_page=20' "$GH_TEST_LOG"
grep -Fq 'issues/comments?sort=updated&direction=desc&per_page=10' "$GH_TEST_LOG"
grep -Fq 'pullSearchQuery=repo:test/target is:pr is:closed is:unmerged' "$GH_TEST_LOG"
grep -Fq 'issueSearchQuery=repo:test/target is:issue is:closed' "$GH_TEST_LOG"
grep -Fq 'api repos/test/sweeper/contents/config/automation-limits.json -H Accept: application/vnd.github.raw' "$GH_TEST_LOG"
if grep -Fq 'run view 25' "$GH_TEST_LOG"; then
  echo "queue-backed exact-review workflow was not deduplicated against the queue" >&2
  exit 1
fi
grep -Fq 'run view 26' "$GH_TEST_LOG"

run_case public "$public_fixture"
assert_contains '- Exact-review queue: 8/28 active, 9 pending (target test/target: occupancy unavailable)' "$tmpdir/output"
assert_queue_jobs
assert_contains '- Queue health: warning (handoff_delayed) — ready 2, admissible 1, oldest pending 12m' "$tmpdir/output"
assert_health

run_case full "$tmpdir/full.json"
assert_contains '- Exact-review queue: 8/28 active, 9 pending (target test/target: 6/24 active, 1 pending)' "$tmpdir/output"
assert_queue_jobs
assert_contains '- Queue health: warning (handoff_delayed) — ready 2, admissible 1, oldest pending test/target#42 12m' "$tmpdir/output"
assert_health

run_case legacy-health "$tmpdir/legacy.json"
assert_queue_jobs
assert_contains '- Queue health: unknown — ready unknown, admissible unknown' "$tmpdir/output"
assert_contains '- Publication tail: unavailable' "$tmpdir/output"
assert_not_contains 'oldest pending' "$tmpdir/output"
assert_not_contains '- Queue backoff:' "$tmpdir/output"
assert_not_contains '- Queue parked' "$tmpdir/output"
assert_not_contains '- Shed since reset:' "$tmpdir/output"

for target_stats in null '{}' '"private"'; do
  jq --argjson rows "$target_stats" '.target_stats = $rows' "$public_fixture" >"$tmpdir/queue.json"
  run_case "target-stats-$target_stats" "$tmpdir/queue.json"
  assert_contains '(target test/target: occupancy unavailable)' "$tmpdir/output"
  assert_queue_jobs
  assert_health
done

for target_stats in '[]' '[{"target_repo":"test/other","pending":1,"dispatching":2,"leased":4}]'; do
  jq --argjson rows "$target_stats" '.target_stats = $rows' "$tmpdir/legacy.json" >"$tmpdir/queue.json"
  run_case target-absent-from-array "$tmpdir/queue.json"
  assert_contains '- Exact-review queue: 8/28 active, 2 pending (target test/target: 0/24 active, 0 pending)' "$tmpdir/output"
  assert_queue_jobs
done

# Empty whitespace-separated columns must never shift reasons, ages, or counts.
for optional_text in '""' null; do
  jq --argjson text "$optional_text" '
    .handoff_health.reason = $text | .oldest_pending_key = $text
  ' "$tmpdir/full.json" >"$tmpdir/queue.json"
  run_case "empty-text-$optional_text" "$tmpdir/queue.json"
  assert_contains '- Queue health: warning — ready 2, admissible 1, oldest pending 12m' "$tmpdir/output"
  assert_health
done

for empty_reasons in backoff_reasons parked_reasons; do
  jq --arg field "$empty_reasons" '
    .handoff_health.reason = "" | .oldest_pending_key = "" |
    .lanes.review[$field] = {} | .lanes.publication[$field] = {}
  ' "$tmpdir/full.json" >"$tmpdir/queue.json"
  run_case "empty-$empty_reasons" "$tmpdir/queue.json"
  assert_contains '- Queue health: warning — ready 2, admissible 1, oldest pending 12m' "$tmpdir/output"
  assert_contains '- Shed since reset: 17' "$tmpdir/output"
  if [ "$empty_reasons" = backoff_reasons ]; then
    assert_not_contains '- Queue backoff:' "$tmpdir/output"
    assert_not_contains '- Publication backoff:' "$tmpdir/output"
    assert_contains '- Queue parked (needs operator): review_retry_exhausted 3' "$tmpdir/output"
    assert_contains '- Publication parked (needs operator): dispatch_rejected 2' "$tmpdir/output"
  else
    assert_not_contains '- Queue parked' "$tmpdir/output"
    assert_not_contains '- Publication parked' "$tmpdir/output"
    assert_contains '- Queue backoff: throttle_retry 5, review_retry 2' "$tmpdir/output"
    assert_contains '- Publication backoff: publication_retry 4' "$tmpdir/output"
  fi
done

jq '
  .handoff_health = {status: "healthy", reason: ""} | .oldest_pending_key = "" |
  .ready_pending = 0 | .admissible_pending = 0 | .oldest_pending_age_seconds = null |
  .shed_since_reset = 0 |
  .lanes.review.backoff_reasons = {} | .lanes.review.parked_reasons = {} |
  .lanes.publication = {pending: 0, ready: 0, backoff: 0, parked: 0, active: 0}
' "$tmpdir/full.json" >"$tmpdir/queue.json"
run_case empty-optionals "$tmpdir/queue.json"
assert_contains '- Queue health: healthy — ready 0, admissible 0' "$tmpdir/output"
assert_contains '- Publication tail: 0 pending, 0 ready, 0 backoff, 0 parked, 0 active' "$tmpdir/output"
assert_not_contains 'oldest pending' "$tmpdir/output"
assert_not_contains '- Queue backoff:' "$tmpdir/output"
assert_not_contains '- Queue parked' "$tmpdir/output"
assert_not_contains '- Publication backoff:' "$tmpdir/output"
assert_not_contains '- Publication parked' "$tmpdir/output"
assert_not_contains '- Shed since reset:' "$tmpdir/output"

jq '.lanes.publication = {}' "$tmpdir/legacy.json" >"$tmpdir/queue.json"
run_case publication-unknown "$tmpdir/queue.json"
assert_contains '- Publication tail: unknown pending, unknown ready, unknown backoff, unknown parked, unknown active' "$tmpdir/output"

run_case unavailable-fetch "$public_fixture" fail
assert_unavailable
printf '%s\n' '{malformed' >"$tmpdir/queue.json"
run_case malformed-json "$tmpdir/queue.json"
assert_unavailable
for field in pending dispatching leased; do
  for invalid in missing null '"5"'; do
    if [ "$invalid" = missing ]; then
      jq --arg field "$field" 'del(.[$field])' "$tmpdir/full.json" >"$tmpdir/queue.json"
    else
      jq --arg field "$field" --argjson value "$invalid" '.[$field] = $value' "$tmpdir/full.json" >"$tmpdir/queue.json"
    fi
    run_case "invalid-$field-$invalid" "$tmpdir/queue.json"
    assert_unavailable
  done
done
printf '%s\n' '[]' >"$tmpdir/queue.json"
run_case invalid-top-level "$tmpdir/queue.json"
assert_unavailable

# Stay within the 100-run request bound, but emit far more than a pipe buffer.
# Forty groups with unequal counts and long names reliably expose early readers.
export GH_TEST_FIXTURES="$tmpdir"
jq -n '
  [range(0; 40) as $group | range(0; 1 + ($group % 4)) as $copy |
    {databaseId: (1000 + $group * 4 + $copy),
     name: ("group-" + (100 + $group | tostring) + "-" + ("x" * 16384)),
     event: "workflow_dispatch", status: "pending", conclusion: null,
     createdAt: "2099-01-01T00:00:00Z", url: "https://github.test/runs/volume"}]
' >"$tmpdir/runs.json"
jq -n '
  [range(0; 10) | {title: "Merged fixture", url: ("https://github.test/merged/" + tostring),
    mergedAt: ("2099-01-01T00:00:0" + tostring + "Z")}]
' >"$tmpdir/pulls.json"
jq -n '
  [range(0; 10) | {user: {login: "clawsweeper"},
    body: (if . % 2 == 0 then "Codex review: clean" else "Applied fix" end),
    html_url: ("https://github.test/comment/" + tostring),
    issue_url: ("https://api.github.test/issues/" + tostring)}]
' >"$tmpdir/comments.json"
jq -n '
  [range(0; 10) | {title: "Closed fixture", url: ("https://github.test/closed/" + tostring),
    closedAt: ("2099-01-01T00:00:0" + tostring + "Z"),
    timelineItems: {nodes: [{actor: {login: "clawsweeper"}}]}}] |
  {data: {pulls: {nodes: .[0:5]}, issues: {nodes: .[5:]}}}
' >"$tmpdir/closed.json"
GH_TEST_MODE=volume TEST_LIMIT=3 TEST_RUN_LIMIT=100 run_case volume "$public_fixture"

# Verify every group and activity row in order, not just the final heading.
awk '/^- [0-9]+x / {sub(/-x+:.*/, ""); print}' "$tmpdir/output" >"$tmpdir/groups"
{
  for count in 4 3; do
    for ((group = 100 + count - 1; group < 140; group += 4)); do
      printf -- '- %sx group-%s\n' "$count" "$group"
    done
  done
} >"$tmpdir/expected-groups"
diff -u "$tmpdir/expected-groups" "$tmpdir/groups"
awk '/^## Recently / {print} /^- https:\/\/github.test\// {print $2}' \
  "$tmpdir/output" >"$tmpdir/activity"
cat >"$tmpdir/expected-activity" <<'EOF'
## Recently merged
https://github.test/merged/9
https://github.test/merged/8
https://github.test/merged/7
## Recently reviewed
https://github.test/comment/0
https://github.test/comment/2
https://github.test/comment/4
## Recently commented
https://github.test/comment/1
https://github.test/comment/3
https://github.test/comment/5
## Recently closed
https://github.test/closed/9
https://github.test/closed/8
https://github.test/closed/7
EOF
diff -u "$tmpdir/expected-activity" "$tmpdir/activity"
assert_contains 'run list --repo test/sweeper --limit 100 --json' "$GH_TEST_LOG"
assert_contains 'status=in_progress&per_page=50 --jq' "$GH_TEST_LOG"
assert_contains 'issues/comments?sort=updated&direction=desc&per_page=10' "$GH_TEST_LOG"
assert_contains 'pr list --repo test/target --state merged' "$GH_TEST_LOG"
assert_contains '--limit 10 --json title,url,mergedAt,mergedBy,labels' "$GH_TEST_LOG"
assert_contains '-F first=50' "$GH_TEST_LOG"
assert_not_contains 'run view' "$GH_TEST_LOG"
[ "$(grep -c '^api repos/test/sweeper/actions/runs?status=' "$GH_TEST_LOG")" -eq 8 ]
[ "$(grep -c '^\(api\|run\|pr\) ' "$GH_TEST_LOG")" -eq 13 ]
assert_contains '- Active workflow runs: 100' "$tmpdir/output"
assert_contains '- Publication tail:' "$tmpdir/output"
echo 'PASS: high-volume snapshot, row caps/order, and bounded requests'

assert_failure() {
  test_case="$1"
  if GH_TEST_MODE="$1" JQ_TEST_MODE="$1" CURL_TEST_FIXTURE="$public_fixture" PATH="$tmpdir:$PATH" \
    bash "$script_dir/clawsweeper-status.sh" --repo test/target --clawsweeper-repo test/sweeper \
    --limit 3 --run-limit 12 >"$tmpdir/output" 2>"$tmpdir/error"; then
    printf 'FAIL [%s]: expected failure\n' "$test_case" >&2
    exit 1
  else
    result=$?
  fi
  if [ "$result" -ne "$2" ]; then
    printf 'FAIL [%s]: expected exit %s, got %s\n' "$test_case" "$2" "$result" >&2
    cat "$tmpdir/error" >&2
    exit 1
  fi
  assert_contains "$3" "$tmpdir/error"
  assert_not_contains '## Recently closed' "$tmpdir/output"
  printf 'PASS: %s exited %s with diagnostic\n' "$test_case" "$result"
}
assert_failure producer-failure 37 'mock run producer failed'
assert_failure required-fetch-failure 38 'mock closed-item fetch failed'
assert_failure malformed-input 5 'parse error:'
assert_failure renderer-failure 5 'mock workflow renderer failed'

echo "clawsweeper-status tests passed"
