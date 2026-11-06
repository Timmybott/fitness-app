#!/bin/sh
# Smoke test for the edit/copy/favourite/password/body endpoints, with a throwaway account.
# Run on the API server: sh smoke-edit.sh   (prints the test account's e-mail to delete afterwards)
set -e
B=http://localhost:3000
E="smoke-$(date +%s)@test.local"
P1="$(head -c 12 /dev/urandom | base64)"
P2="$(head -c 12 /dev/urandom | base64)"
j() { node -pe "const o=JSON.parse(require('fs').readFileSync(0)); $1"; }
T=$(curl -s -X POST $B/auth/register -H 'content-type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P1\",\"name\":\"T\"}" | j o.token)
A="authorization: Bearer $T"
C='content-type: application/json'

echo "-- entry edit"
ID=$(curl -s -X POST $B/entries -H "$A" -H "$C" -d '{"food":{"name":"Apfel","kcal":52,"protein":0.3,"carbs":11.6,"fat":0.3},"grams":100,"date":"2026-11-05","meal":"snack"}' | j o.id)
curl -s -X PUT $B/entries/$ID -H "$A" -H "$C" -d '{"grams":250,"meal":"breakfast","date":"2026-11-06"}'; echo
echo "-- copy day"
curl -s -X POST $B/entries/copy -H "$A" -H "$C" -d '{"fromDate":"2026-11-06","toDate":"2026-11-07","toMeal":"lunch"}' | j 'o.map(e=>e.date.slice(0,10)+" "+e.meal+" "+e.kcal).join(", ")'
echo "-- foods + favourite"
F=$(curl -s "$B/foods/recent?all=1" -H "$A" | j 'o[0].id')
curl -s -X PUT $B/foods/$F/favorite -H "$A" -H "$C" -d '{"favorite":true}'; echo
curl -s -X PUT $B/foods/$F -H "$A" -H "$C" -d '{"name":"Apfel rot","kcal":54,"protein":0.3,"carbs":12,"fat":0.2,"servingGrams":150}' | j 'o.name+" fav="+o.favorite'
echo "-- workout edit"
EX=$(curl -s $B/exercises -H "$A" | j 'o[0].id')
W=$(curl -s -X POST $B/workouts -H "$A" -H "$C" -d "{\"name\":\"A\",\"startedAt\":\"2026-11-05T17:00:00Z\",\"finishedAt\":\"2026-11-05T18:00:00Z\",\"kcal\":100,\"sets\":[{\"exerciseId\":$EX,\"position\":0,\"setIndex\":0,\"weight\":50,\"reps\":10}]}" | j o.id)
curl -s -X PUT $B/workouts/$W -H "$A" -H "$C" -d "{\"name\":\"B\",\"startedAt\":\"2026-11-05T17:00:00Z\",\"finishedAt\":\"2026-11-05T18:10:00Z\",\"kcal\":150,\"sets\":[{\"exerciseId\":$EX,\"position\":0,\"setIndex\":0,\"weight\":60,\"reps\":8},{\"exerciseId\":$EX,\"position\":0,\"setIndex\":1,\"weight\":60,\"reps\":8}]}" >/dev/null
curl -s $B/workouts/$W -H "$A" | j 'o.name+" "+o.kcal+" sets="+o.sets.length'
echo "-- cardio edit"
CA=$(curl -s -X POST $B/cardio -H "$A" -H "$C" -d '{"date":"2026-11-05","type":"Laufen","minutes":30}' | j o.id)
curl -s -X PUT $B/cardio/$CA -H "$A" -H "$C" -d '{"date":"2026-11-04","type":"Fahrrad","minutes":45,"distanceKm":15,"kcal":300}'; echo
echo "-- body"
curl -s -X PUT $B/body -H "$A" -H "$C" -d '{"birthYear":1998,"sex":"m"}' >/dev/null
curl -s -X PUT $B/body -H "$A" -H "$C" -d '{"heightCm":181}' >/dev/null
curl -s $B/body -H "$A"; echo
echo "-- password"
curl -s -X POST $B/auth/password -H "$A" -H "$C" -d "{\"current\":\"wrong-password\",\"next\":\"$P2\"}"; echo
curl -s -X POST $B/auth/password -H "$A" -H "$C" -d "{\"current\":\"$P1\",\"next\":\"$P2\"}"; echo
curl -s -X POST $B/auth/login -H "$C" -d "{\"email\":\"$E\",\"password\":\"$P2\"}" | j '"login with new password: "+!!o.token'
curl -s $B/me -H "$A" | j '"current session still valid: "+!!o.id'
echo "$E"
