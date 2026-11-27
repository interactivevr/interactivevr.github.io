@echo off
setlocal enabledelayedexpansion

REM Move to the repository root where publish.bat lives
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo [1/4] Typechecking and building app-source...
pushd "%ROOT_DIR%app-source"
if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd ci
  if errorlevel 1 (
    popd
    goto :error
  )
)

call npm.cmd run typecheck
if errorlevel 1 (
  popd
  goto :error
)

call npm.cmd run build
if errorlevel 1 (
  popd
  goto :error
)
popd

echo [2/4] Copying dist output to repository root...
if not exist "%ROOT_DIR%app-source\dist\index.html" (
  echo Build output missing: app-source\dist\index.html
  goto :error
)

if exist "%ROOT_DIR%assets" rmdir /s /q "%ROOT_DIR%assets"
if exist "%ROOT_DIR%index.html" del /f /q "%ROOT_DIR%index.html"

xcopy /E /I /Y "%ROOT_DIR%app-source\dist\*" "%ROOT_DIR%" >nul
if errorlevel 1 goto :error

echo [3/4] Staging and committing latest changes...
git add -A
if errorlevel 1 goto :error

set "COMMIT_MSG=%*"
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=Publish VR Catch Arena build"

set "HAS_CHANGES=0"
git rev-parse --verify HEAD >nul 2>&1
if errorlevel 1 (
  set "HAS_CHANGES=1"
) else (
  git diff --cached --quiet
  if errorlevel 1 set "HAS_CHANGES=1"
)

if "%HAS_CHANGES%"=="1" (
  git commit -m "%COMMIT_MSG%"
  if errorlevel 1 goto :error
) else (
  echo No new changes to commit.
)

echo [4/4] Pushing to origin main...
git push origin HEAD:main
if errorlevel 1 goto :error

echo.
echo Publish complete! Live site will update at https://interactivevr.github.io
exit /b 0

:error
echo.
echo Publish failed with error code %errorlevel%.
exit /b 1
