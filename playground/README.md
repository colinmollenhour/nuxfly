This is a simple "playground" app for testing and demonstrating the Nuxfly module. It is a basic Todo app that uses the SQLite database and S3-compatible storage for public files.

You can deploy this yourself on your own Fly.io account with just these commands (assuming `flyctl` is installed and authenticated already):

```bash
git clone https://github.com/colinmollenhour/nuxfly.git
cd nuxfly/playground
nuxfly launch
```

![screenshot](https://raw.githubusercontent.com/colinmollenhour/nuxfly/refs/heads/main/playground/screenshot.png)