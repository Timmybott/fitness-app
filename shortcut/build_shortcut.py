"""
Generates the "Fitness Sync" iOS shortcut (unsigned plist) and optionally signs it via RoutineHub HubSign.

The shortcut is generic (no server address or token inside), so it is safe to sign through a third-party
service. The app hands over "setup|<server>|<token>" once; the shortcut stores it in iCloud Drive
(Shortcuts/fitness/config.txt) and uses it on every automated run:

  1. import: today's steps, active calories, exercise minutes, walking+running distance, flights climbed
     and the latest weight from Apple Health  ->  POST /health/sync
  2. export: GET /health/export (finished days: nutrition, weight, workouts) -> Log Health Sample /
     Log Workout -> POST /health/export/ack

Action/parameter shapes were taken from a shortcut built on the user's iPhone (iOS 27.2) and from the
Cherri compiler (conditionals, repeat). Usage:

  python build_shortcut.py            # writes fitness-sync.unsigned.plist
  python build_shortcut.py --sign     # also writes ../backend/static/fitness-sync.shortcut
"""

import json
import plistlib
import subprocess
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).parent
NAME = 'Fitness Sync'
CONFIG_PATH = 'fitness/config.txt'

actions: list[dict] = []


def new_uuid() -> str:
    return str(uuid.uuid4()).upper()


def add(identifier: str, params: dict) -> dict:
    """Appends an action and returns a reference to its output."""
    params = dict(params)
    params.setdefault('UUID', new_uuid())
    actions.append({'WFWorkflowActionIdentifier': f'is.workflow.actions.{identifier}', 'WFWorkflowActionParameters': params})
    return params


# --- variable references -------------------------------------------------------------------------

def out(action: dict, name: str, aggr: list | None = None) -> dict:
    ref = {'OutputUUID': action['UUID'], 'Type': 'ActionOutput', 'OutputName': name}
    if aggr:
        ref['Aggrandizements'] = aggr
    return ref


def named(var: str, aggr: list | None = None) -> dict:
    ref = {'Type': 'Variable', 'VariableName': var}
    if aggr:
        ref['Aggrandizements'] = aggr
    return ref


SHORTCUT_INPUT = {'Type': 'ExtensionInput'}


def dict_key(key: str) -> list:
    return [
        {'Type': 'WFCoercionVariableAggrandizement', 'CoercionItemClass': 'WFDictionaryContentItem'},
        {'Type': 'WFDictionaryValueVariableAggrandizement', 'DictionaryKey': key},
    ]


def attachment(ref: dict) -> dict:
    return {'Value': ref, 'WFSerializationType': 'WFTextTokenAttachment'}


def text(*parts) -> dict:
    """Text with embedded variables: parts are plain strings or variable references."""
    s, attachments = '', {}
    for p in parts:
        if isinstance(p, str):
            s += p
        else:
            attachments[f'{{{len(s)}, 1}}'] = p
            s += '￼'
    return {'Value': {'string': s, 'attachmentsByRange': attachments}, 'WFSerializationType': 'WFTextTokenString'}


def dictionary(items: dict) -> dict:
    """Dictionary field (all values as text; the server parses numbers leniently)."""
    return {
        'Value': {
            'WFDictionaryFieldValueItems': [
                {'WFItemType': 0, 'WFKey': text(k), 'WFValue': v if isinstance(v, dict) and 'WFSerializationType' in v else text(v)}
                for k, v in items.items()
            ]
        },
        'WFSerializationType': 'WFDictionaryFieldValue',
    }


def quantity(magnitude, unit: str) -> dict:
    return {'Value': {'Unit': unit, 'Magnitude': magnitude}, 'WFSerializationType': 'WFQuantityFieldValue'}


# --- control flow (shapes from the Cherri compiler) -----------------------------------------------

def if_begin(ref: dict, condition: int, value: str | None = None, number=None) -> str:
    group = new_uuid()
    params = {'GroupingIdentifier': group, 'WFControlFlowMode': 0, 'WFCondition': condition,
              'WFInput': {'Type': 'Variable', 'Variable': attachment(ref)}}
    if value is not None:
        params['WFConditionalActionString'] = value
    if number is not None:
        params['WFNumberValue'] = number
    add('conditional', params)
    return group


def if_end(group: str) -> None:
    add('conditional', {'GroupingIdentifier': group, 'WFControlFlowMode': 2})


def repeat_each(ref: dict) -> str:
    group = new_uuid()
    add('repeat.each', {'GroupingIdentifier': group, 'WFControlFlowMode': 0, 'WFInput': attachment(ref)})
    return group


def repeat_end(group: str) -> None:
    add('repeat.each', {'GroupingIdentifier': group, 'WFControlFlowMode': 2})


IS, BEGINS_WITH, GREATER_THAN = 4, 8, 2


# --- Health ---------------------------------------------------------------------------------------

def find_health(sample_type: str, today_only: bool = True, latest: bool = False) -> dict:
    templates = [{'Bounded': True, 'Operator': 4, 'Property': 'Type', 'Removable': False,
                  'Values': {'Enumeration': {'Value': sample_type, 'WFSerializationType': 'WFStringSubstitutableState'}}}]
    if today_only:
        # 1002 = "is today" (Unit/Number are what Shortcuts itself stores alongside it)
        templates.append({'Bounded': True, 'Operator': 1002, 'Property': 'Start Date', 'Removable': False,
                          'Values': {'Unit': 16, 'Number': '7'}})
    params = {'WFContentItemFilter': {
        'Value': {'WFActionParameterFilterPrefix': 1, 'WFContentPredicateBoundedDate': False,
                  'WFActionParameterFilterTemplates': templates},
        'WFSerializationType': 'WFContentPredicateTableTemplate'}}
    if latest:
        params.update({'WFContentItemSortProperty': 'Start Date', 'WFContentItemSortOrder': 'Latest First',
                       'WFContentItemLimitEnabled': True, 'WFContentItemLimitNumber': 1.0})
    else:
        # One deduplicated total per day (iPhone + Watch samples would otherwise be counted twice).
        params['WFHKSampleFilteringGroupBy'] = 'Day'
    return add('filter.health.quantity', params)


def today_sum(sample_type: str) -> dict:
    samples = find_health(sample_type)
    return add('statistics', {'WFStatisticsOperation': 'Sum', 'WFInput': attachment(out(samples, 'Health-Messungen'))})


def log_sample(sample_type: str, unit: str, item: str) -> None:
    add('health.quantity.log', {
        'WFQuantitySampleType': sample_type,
        'WFQuantitySampleQuantity': quantity(text(named(item, dict_key('value'))), unit),
        'WFQuantitySampleDate': text(named(item, dict_key('date'))),
    })


def get_url(url_parts: tuple, method: str, auth: dict, body: dict | None = None) -> dict:
    params = {
        'WFURL': text(*url_parts),
        'WFHTTPMethod': method,
        'ShowHeaders': True,
        'WFHTTPHeaders': dictionary({'Authorization': text('Bearer ', auth)}),
    }
    if body is not None:
        params['WFHTTPBodyType'] = 'JSON'
        params['WFJSONValues'] = dictionary(body)
    return add('downloadurl', params)


# --- the shortcut ---------------------------------------------------------------------------------

def build() -> dict:
    actions.clear()

    # Setup: the app runs the shortcut with "setup|<server>|<token>" as input.
    g = if_begin(SHORTCUT_INPUT, BEGINS_WITH, 'setup|')
    parts = add('text.split', {'WFTextSeparator': 'Custom', 'WFTextCustomSeparator': '|', 'text': attachment(SHORTCUT_INPUT)})
    server = add('getitemfromlist', {'WFItemSpecifier': 'Item At Index', 'WFItemIndex': 2.0, 'WFInput': attachment(out(parts, 'Geteilter Text'))})
    token = add('getitemfromlist', {'WFItemSpecifier': 'Item At Index', 'WFItemIndex': 3.0, 'WFInput': attachment(out(parts, 'Geteilter Text'))})
    config = add('gettext', {'WFTextActionText': text(out(server, 'Objekt aus Liste'), '|', out(token, 'Objekt aus Liste'))})
    add('documentpicker.save', {'WFInput': attachment(out(config, 'Text')), 'WFAskWhereToSave': False,
                                'WFFileDestinationPath': CONFIG_PATH, 'WFSaveFileOverwrite': True})
    add('notification', {'WFNotificationActionTitle': 'Fitness Sync', 'WFNotificationActionBody': 'Verbunden. Der Abgleich läuft ab jetzt automatisch.'})
    add('exit', {})
    if_end(g)

    # Load server address and token saved during setup.
    file = add('documentpicker.open', {'WFGetFilePath': CONFIG_PATH, 'WFShowFilePicker': False, 'WFFileErrorIfNotFound': True})
    cfg_parts = add('text.split', {'WFTextSeparator': 'Custom', 'WFTextCustomSeparator': '|', 'text': attachment(out(file, 'Datei'))})
    add('setvariable', {'WFVariableName': 'server', 'WFInput': attachment(out(add('getitemfromlist', {
        'WFItemSpecifier': 'First Item', 'WFInput': attachment(out(cfg_parts, 'Geteilter Text'))}), 'Objekt aus Liste'))})
    add('setvariable', {'WFVariableName': 'token', 'WFInput': attachment(out(add('getitemfromlist', {
        'WFItemSpecifier': 'Last Item', 'WFInput': attachment(out(cfg_parts, 'Geteilter Text'))}), 'Objekt aus Liste'))})
    server_ref, token_ref = named('server'), named('token')

    # 1. Import from Health (hourly).
    steps = today_sum('Steps')
    active = today_sum('Active Calories')
    exercise = today_sum('Exercise Minutes')
    distance = today_sum('Walking + Running Distance')
    flights = today_sum('Flights Climbed')
    weight = find_health('Weight', today_only=False, latest=True)
    get_url((server_ref, '/health/sync'), 'POST', token_ref, {
        'steps': text(out(steps, 'Statistik')),
        'activeKcal': text(out(active, 'Statistik')),
        'exerciseMin': text(out(exercise, 'Statistik')),
        'distanceKm': text(out(distance, 'Statistik')),
        'flights': text(out(flights, 'Statistik')),
        'weightKg': text(out(weight, 'Health-Messungen')),
    })

    # 2. Export to Health (finished days only, so effectively after midnight).
    export = get_url((server_ref, '/health/export'), 'GET', token_ref)
    add('setvariable', {'WFVariableName': 'export', 'WFInput': attachment(out(export, 'Inhalte von URL'))})
    g_count = if_begin(named('export', dict_key('count')), GREATER_THAN, number=0)

    r = repeat_each(named('export', dict_key('samples')))
    for key, sample_type, unit in [('kcal', 'Dietary Calories', 'kcal'), ('protein', 'Protein', 'g'),
                                   ('carbs', 'Carbohydrates', 'g'), ('fat', 'Total Fat', 'g'), ('weight', 'Weight', 'kg')]:
        g_key = if_begin(named('Repeat Item', dict_key('key')), IS, key)
        log_sample(sample_type, unit, 'Repeat Item')
        if_end(g_key)
    repeat_end(r)

    r = repeat_each(named('export', dict_key('workouts')))
    item = 'Repeat Item'
    add('health.workout.log', {
        'WFWorkoutReadableActivityType': text(named(item, dict_key('hkType'))),
        'WFWorkoutDate': text(named(item, dict_key('start'))),
        'WFWorkoutDuration': quantity(text(named(item, dict_key('minutes'))), 'min'),
        'WFWorkoutCaloriesQuantity': quantity(text(named(item, dict_key('kcal'))), 'kcal'),
        'WFWorkoutDistanceQuantity': quantity(text(named(item, dict_key('km'))), 'km'),
    })
    repeat_end(r)

    get_url((server_ref, '/health/export/ack'), 'POST', token_ref, {'ack': text(named('export', dict_key('ack')))})
    if_end(g_count)

    return {
        'WFWorkflowActions': actions,
        'WFWorkflowClientVersion': '5114.0.8.3',
        'WFWorkflowMinimumClientVersion': 1106,
        'WFWorkflowMinimumClientVersionString': '1106',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': 4282601983, 'WFWorkflowIconGlyphNumber': 59446},
        'WFWorkflowImportQuestions': [],
        'WFWorkflowInputContentItemClasses': ['WFStringContentItem'],
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowHasOutputFallback': False,
        'WFWorkflowHasShortcutInputVariables': True,
        'WFWorkflowTypes': [],
        'WFQuickActionSurfaces': [],
    }


def sign(plist_xml: bytes) -> bytes:
    """Signs via HubSign using curl (the service rejects Python's HTTP client)."""
    payload = HERE / 'sign-request.json'
    payload.write_text(json.dumps({'shortcutName': NAME, 'shortcut': plist_xml.decode()}), encoding='utf-8')
    try:
        data = subprocess.run(
            ['curl', '-s', '-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', f'@{payload}',
             'https://hubsign.routinehub.services/sign'],
            capture_output=True, check=True, timeout=90,
        ).stdout
    finally:
        payload.unlink(missing_ok=True)
    if not data.startswith(b'AEA1'):
        raise SystemExit(f'Signing failed: {data[:300]!r}')
    return data


if __name__ == '__main__':
    xml = plistlib.dumps(build(), fmt=plistlib.FMT_XML)
    (HERE / 'fitness-sync.unsigned.plist').write_bytes(xml)
    print(f'{len(actions)} actions, unsigned plist written')
    if '--sign' in sys.argv:
        signed = sign(xml)
        target = HERE.parent / 'backend' / 'static' / 'fitness-sync.shortcut'
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(signed)
        print(f'signed shortcut written to {target} ({len(signed)} bytes)')
