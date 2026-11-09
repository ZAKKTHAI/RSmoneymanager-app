
#!/usr/bin/env bash
set -Eeuo pipefail

# ==========================================
# Kakeibo Release Script
# Windows/Linux: GitHub Actions
# Android: Local Arch Linux build (unsigned)
# ==========================================

TAG="${1:-}"

if [[ -z "$TAG" || ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
  echo "Usage: ./scripts/release.sh v1.0.0"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SDK="$HOME/Android/Sdk"
NDK_VERSION="29.0.13846066"
NDK="$SDK/ndk/$NDK_VERSION"

APK_SOURCE="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
ARTIFACT_DIR="release-artifacts"
APK_NAME="kakeibo-${TAG}-android-unsigned.apk"
APK_DEST="$ARTIFACT_DIR/$APK_NAME"

echo "======================================"
echo " Kakeibo Release: $TAG"
echo "======================================"

# 必要コマンド確認
for cmd in npm gh git; do
  command -v "$cmd" >/dev/null || {
    echo "ERROR: $cmd がインストールされていません"
    exit 1
  }
done

# GitHub認証確認
gh auth status

# Android環境
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export NDK_HOME="$NDK"
export ANDROID_NDK_HOME="$NDK"

if [[ ! -d "$NDK" ]]; then
  echo "ERROR: Android NDKが見つかりません: $NDK"
  exit 1
fi

if ! rustup target list --installed | grep -qx "aarch64-linux-android"; then
  echo "ERROR: Android Rust targetがありません"
  echo "Run: rustup target add aarch64-linux-android"
  exit 1
fi

# タグ重複確認
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "ERROR: タグ $TAG は既に存在します"
  exit 1
fi

# Android APKビルド
echo ""
echo "[1/4] Building Android APK..."

npm run tauri -- android build --apk

if [[ ! -f "$APK_SOURCE" ]]; then
  echo "ERROR: APKが生成されませんでした"
  exit 1
fi

# APKをリリース用にコピー
mkdir -p "$ARTIFACT_DIR"
cp "$APK_SOURCE" "$APK_DEST"

echo "APK: $APK_DEST"

# Gitタグ作成
echo ""
echo "[2/4] Creating Git tag..."

git tag -a "$TAG" -m "Release $TAG"

# タグPush → GitHub Actions起動
echo ""
echo "[3/4] Pushing tag..."

if ! git push origin "$TAG"; then
  echo "ERROR: タグのPushに失敗しました"
  echo "ローカルタグは残っています。必要に応じて削除してください:"
  echo "  git tag -d $TAG"
  exit 1
fi

# GitHub ActionsによるRelease作成を待つ
echo ""
echo "[4/4] Waiting for GitHub Release..."

TIMEOUT=900
INTERVAL=10
ELAPSED=0

while ! gh release view "$TAG" >/dev/null 2>&1; do
  if (( ELAPSED >= TIMEOUT )); then
    echo "ERROR: Releaseの作成待ちがタイムアウトしました"
    echo "GitHub Actionsの実行状況を確認してください"
    echo "APKは $APK_DEST に保存されています"
    exit 1
  fi

  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
  echo "Waiting... ${ELAPSED}/${TIMEOUT}s"
done

# APKをReleaseに追加
echo ""
echo "Uploading Android APK..."

gh release upload "$TAG" "$APK_DEST" --clobber

echo ""
echo "======================================"
echo " RELEASE COMPLETED!"
echo "======================================"

gh release view "$TAG"
