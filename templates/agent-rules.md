Use `shrinker` for high-volume terminal outputs to reduce tokens.

Routing policy:
- `git status|diff|log|show|reflog|branch|tag|stash` -> `shrinker git ...`
- `npm test|t|install|i|ci|ls|list` -> `shrinker npm ...`
- `docker ps|logs|images|compose` -> `shrinker docker ...`
- `kubectl get|describe|logs` -> `shrinker kubectl ...`
- `gh pr|issue|run` -> `shrinker gh ...`
- `rg`, `find`, `tail`, `cat`, `ls`, `dir` -> `shrinker <command> ...`

Bypass shrinker when:
- command modifies remote state and output volume is already tiny
- command requires interactive stdin
- command explicitly needs `shrinker --raw`

Examples:
- `shrinker git log -n 20`
- `shrinker rg "pattern" src`
- `shrinker docker logs api --tail 500`