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

# Values read from a dictionary (and the shortcut input) have no known type, so comparisons like
# "begins with" / "is greater than" and quantity fields are invalid (red) unless the variable is
# coerced "as Text" / "as Number" first. Like Cherri: dictionary access first, then the coercion.
AS_TEXT = 'WFStringContentItem'
AS_NUMBER = 'WFNumberContentItem'


def coerce(item_class: str) -> dict:
    return {'Type': 'WFCoercionVariableAggrandizement', 'CoercionItemClass': item_class}


def dict_key(key: str, as_type: str | None = None) -> list:
    aggr = [{'Type': 'WFDictionaryValueVariableAggrandizement', 'DictionaryKey': key}]
    if as_type:
        aggr.append(coerce(as_type))
    return aggr


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
    value = {'string': s}
    if attachments:
        value['attachmentsByRange'] = attachments
    return {'Value': value, 'WFSerializationType': 'WFTextTokenString'}


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
    """Quantity field. A variable magnitude is the bare variable reference, not text (as in Cherri)."""
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


def repeat_each(ref: dict, item_var: str) -> str:
    """Repeat with each; like Cherri, the repeat item is stored in `item_var` right away."""
    group = new_uuid()
    add('repeat.each', {'GroupingIdentifier': group, 'WFControlFlowMode': 0, 'WFInput': attachment(ref)})
    add('setvariable', {'WFVariableName': item_var, 'WFInput': attachment(named('Repeat Item'))})
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
        'WFQuantitySampleQuantity': quantity(named(item, dict_key('value', AS_NUMBER)), unit),
        'WFQuantitySampleDate': text(named(item, dict_key('date', AS_TEXT))),
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
    g = if_begin({**SHORTCUT_INPUT, 'Aggrandizements': [coerce(AS_TEXT)]}, BEGINS_WITH, 'setup|')
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

    # 1. Export to Health (finished days only, so effectively after midnight). Runs first because
    #    "Find Health Samples" aborts the whole shortcut when it finds nothing (e.g. no steps yet at 0:00).
    export = get_url((server_ref, '/health/export'), 'GET', token_ref)
    export_dict = add('detect.dictionary', {'WFInput': attachment(out(export, 'Inhalte von URL'))})
    add('setvariable', {'WFVariableName': 'export', 'WFInput': attachment(out(export_dict, 'Wörterbuch'))})
    g_count = if_begin(named('export', dict_key('count', AS_NUMBER)), GREATER_THAN, number=0)

    r = repeat_each(named('export', dict_key('samples')), 'sample')
    for key, sample_type, unit in [('kcal', 'Dietary Calories', 'kcal'), ('protein', 'Protein', 'g'),
                                   ('carbs', 'Carbohydrates', 'g'), ('fat', 'Total Fat', 'g'), ('weight', 'Weight', 'kg')]:
        g_key = if_begin(named('sample', dict_key('key', AS_TEXT)), IS, key)
        log_sample(sample_type, unit, 'sample')
        if_end(g_key)
    repeat_end(r)

    r = repeat_each(named('export', dict_key('workouts')), 'workout')
    add('health.workout.log', {
        'WFWorkoutReadableActivityType': text(named('workout', dict_key('hkType', AS_TEXT))),
        'WFWorkoutDate': text(named('workout', dict_key('start', AS_TEXT))),
        'WFWorkoutDuration': quantity(named('workout', dict_key('minutes', AS_NUMBER)), 'min'),
        'WFWorkoutCaloriesQuantity': quantity(named('workout', dict_key('kcal', AS_NUMBER)), 'kcal'),
        'WFWorkoutDistanceQuantity': quantity(named('workout', dict_key('km', AS_NUMBER)), 'km'),
    })
    repeat_end(r)

    get_url((server_ref, '/health/export/ack'), 'POST', token_ref, {'ack': text(named('export', dict_key('ack', AS_TEXT)))})
    if_end(g_count)

    # 2. Import from Health. An empty search stops the shortcut, so the types that practically always
    #    have data are sent first; exercise time and flights (often 0) follow in a second request.
    steps = today_sum('Steps')
    active = today_sum('Active Calories')
    distance = today_sum('Walking + Running Distance')
    weight = find_health('Weight', today_only=False, latest=True)
    get_url((server_ref, '/health/sync'), 'POST', token_ref, {
        'steps': text(out(steps, 'Statistik')),
        'activeKcal': text(out(active, 'Statistik')),
        'distanceKm': text(out(distance, 'Statistik')),
        'weightKg': text(out(weight, 'Health-Messungen')),
    })

    exercise = today_sum('Exercise Time')  # Shortcuts' name for exercise minutes (from the user's iPhone)
    flights = today_sum('Flights Climbed')
    get_url((server_ref, '/health/sync'), 'POST', token_ref, {
        'exerciseMin': text(out(exercise, 'Statistik')),
        'flights': text(out(flights, 'Statistik')),
    })

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
