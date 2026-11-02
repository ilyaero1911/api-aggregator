"""Build public/internal OpenAPI and the canonical LLM JSON Schema from one model."""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def obj(properties, required=(), extra=False):
    return dict(type='object', properties=properties, required=list(required), additionalProperties=extra)


def arr(items, minimum=0):
    return dict(type='array', items=items, minItems=minimum)


def ref(name):
    return {'$ref': '#/components/schemas/' + name}


S = {'type': 'string'}
I = {'type': 'integer', 'minimum': 0}
B = {'type': 'boolean'}
FREE = {'type': 'object', 'additionalProperties': True}
part = {'oneOf': [
    obj({'type': {'const': 'text'}, 'text': S}, ['type', 'text']),
    obj({'type': {'const': 'image_url'}, 'image_url': obj({'url': S, 'detail': {'enum': ['auto', 'low', 'high']}}, ['url'])}, ['type', 'image_url']),
    obj({'type': {'const': 'file'}, 'file': obj({'file_id': S, 'file_data': S, 'filename': S}, [], False)}, ['type', 'file']),
    obj({'type': {'const': 'input_audio'}, 'input_audio': obj({'data': S, 'format': {'enum': ['wav', 'mp3']}}, ['data', 'format'])}, ['type', 'input_audio'])
]}
tool = obj({'type': {'const': 'function'}, 'function': obj({'name': S, 'description': S, 'parameters': FREE, 'strict': B}, ['name'])}, ['type', 'function'])
tool_call = obj({'id': S, 'type': {'const': 'function'}, 'function': obj({'name': S, 'arguments': S}, ['name', 'arguments'])}, ['id', 'type', 'function'])
message = obj({'role': {'enum': ['system', 'developer', 'user', 'assistant', 'tool']},
               'content': {'oneOf': [S, arr(part, 1), {'type': 'null'}]},
               'name': S, 'tool_call_id': S, 'tool_calls': arr(tool_call)}, ['role'])
message['allOf'] = [
    {'if': {'properties': {'role': {'const': 'tool'}}}, 'then': {'required': ['tool_call_id', 'content']}},
    {'if': {'properties': {'role': {'enum': ['system', 'developer', 'user']}}}, 'then': {'required': ['content'], 'properties': {'content': {'not': {'type': 'null'}}}}},
    {'if': {'properties': {'role': {'const': 'assistant'}}}, 'then': {'anyOf': [{'required': ['content']}, {'required': ['tool_calls']}]}}
]
part['oneOf'][2]['properties']['file']['oneOf'] = [{'required': ['file_id']}, {'required': ['file_data']}]
chat = obj({'model': dict(type='string', minLength=1), 'messages': arr(message, 1),
            'temperature': dict(type='number', minimum=0, maximum=2), 'top_p': dict(type='number', minimum=0, maximum=1),
            'top_k': I, 'max_tokens': dict(type='integer', minimum=1), 'max_completion_tokens': dict(type='integer', minimum=1),
            'stop': {'oneOf': [S, arr(S, 1)]}, 'seed': {'type': 'integer'},
            'frequency_penalty': dict(type='number', minimum=-2, maximum=2), 'presence_penalty': dict(type='number', minimum=-2, maximum=2),
            'logprobs': B, 'top_logprobs': dict(type='integer', minimum=0, maximum=20),
            'logit_bias': {'type': 'object', 'additionalProperties': dict(type='number', minimum=-100, maximum=100)},
            'response_format': obj({'type': {'enum': ['text', 'json_object', 'json_schema']}, 'json_schema': FREE}, ['type']),
            'tools': arr(tool), 'tool_choice': {'oneOf': [{'enum': ['none', 'auto', 'required']}, obj({'type': {'const': 'function'}, 'function': obj({'name': S}, ['name'])}, ['type', 'function'])]},
            'parallel_tool_calls': B, 'reasoning': obj({'effort': {'enum': ['none', 'low', 'medium', 'high']}, 'max_tokens': I}),
            'prediction': obj({'type': {'const': 'content'}, 'content': S}, ['type', 'content']),
            'user': S, 'stream': B, 'stream_options': obj({'include_usage': B}), 'store': {'const': False},
            'models': arr(S, 1), 'provider': obj({'order': arr(S), 'allow_fallbacks': B, 'require_parameters': B}),
            'transforms': arr(S), 'preset': S}, ['model', 'messages'])
usage = obj({k: I for k in ['prompt_tokens', 'completion_tokens', 'total_tokens', 'cached_tokens', 'cache_write_tokens', 'reasoning_tokens', 'audio_input_tokens', 'audio_output_tokens', 'image_input_tokens', 'image_output_tokens']}, ['prompt_tokens', 'completion_tokens', 'total_tokens'])
finish = {'enum': ['stop', 'length', 'tool_calls', 'content_filter', 'error']}
schemas = {
 'ChatCompletionRequest': chat,
 'Message': message,
 'Usage': usage,
 'ChatCompletionResponse': obj({'id': S, 'object': {'const': 'chat.completion'}, 'created': I, 'model': S, 'choices': arr(obj({'index': I, 'message': message, 'finish_reason': finish}, ['index', 'message', 'finish_reason']), 1), 'usage': ref('Usage')}, ['id', 'object', 'created', 'model', 'choices', 'usage']),
 'Error': obj({'error': obj({'message': S, 'type': S, 'param': {'type': ['string', 'null']}, 'code': {'type': ['string', 'null']}}, ['message', 'type', 'param', 'code'])}, ['error']),
 'ResponsesRequest': obj({'model': S, 'input': {'oneOf': [S, arr(FREE, 1)]}, 'instructions': S, 'max_output_tokens': dict(type='integer', minimum=1), 'stream': B, 'store': {'const': False}, 'tools': arr(FREE), 'text': FREE}, ['model', 'input']),
 'ResponsesResponse': obj({'id': S, 'object': {'const': 'response'}, 'created_at': I, 'status': {'enum': ['completed', 'failed', 'incomplete']}, 'model': S, 'output': arr(FREE), 'usage': FREE}, ['id', 'object', 'status', 'model', 'output']),
 'MessagesRequest': obj({'model': S, 'messages': arr(message, 1), 'max_tokens': dict(type='integer', minimum=1), 'system': {'oneOf': [S, arr(FREE)]}, 'temperature': {'type': 'number'}, 'stream': B, 'tools': arr(FREE)}, ['model', 'messages', 'max_tokens']),
 'MessagesResponse': obj({'id': S, 'type': {'const': 'message'}, 'role': {'const': 'assistant'}, 'model': S, 'content': arr(FREE), 'stop_reason': {'type': ['string', 'null']}, 'usage': FREE}, ['id', 'type', 'role', 'model', 'content', 'usage']),
 'EmbeddingsRequest': obj({'model': S, 'input': {'oneOf': [S, arr(S, 1)]}, 'encoding_format': {'enum': ['float', 'base64']}, 'dimensions': dict(type='integer', minimum=1), 'user': S}, ['model', 'input']),
 'EmbeddingsResponse': obj({'object': {'const': 'list'}, 'model': S, 'data': arr(obj({'index': I, 'object': {'const': 'embedding'}, 'embedding': {'oneOf': [arr({'type': 'number'}), S]}}, ['index', 'object', 'embedding'])), 'usage': FREE}, ['object', 'model', 'data', 'usage']),
 'RerankRequest': obj({'model': S, 'query': S, 'documents': arr(S, 1), 'top_n': dict(type='integer', minimum=1), 'return_documents': B}, ['model', 'query', 'documents']),
 'RerankResponse': obj({'id': S, 'results': arr(obj({'index': I, 'relevance_score': {'type': 'number'}, 'document': S}, ['index', 'relevance_score']))}, ['id', 'results']),
 'ImageRequest': obj({'model': S, 'prompt': S, 'n': dict(type='integer', minimum=1, maximum=10), 'size': S, 'response_format': {'enum': ['url', 'b64_json']}}, ['model', 'prompt']),
 'ImageResponse': obj({'created': I, 'data': arr(obj({'url': S, 'b64_json': S, 'revised_prompt': S}))}, ['created', 'data']),
 'SpeechRequest': obj({'model': S, 'input': S, 'voice': S, 'response_format': {'enum': ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']}, 'speed': dict(type='number', minimum=0.25, maximum=4)}, ['model', 'input', 'voice']),
 'TranscriptionRequest': obj({'file': {'type': 'string', 'format': 'binary'}, 'model': S, 'language': S, 'response_format': {'enum': ['json', 'text', 'verbose_json', 'srt', 'vtt']}}, ['file', 'model']),
 'TranscriptionResponse': obj({'text': S}, ['text']),
 'Model': obj({'id': S, 'object': {'const': 'model'}, 'created': I, 'owned_by': S, 'modalities': arr(S), 'context_length': I}, ['id', 'object', 'created', 'owned_by']),
 'ModelList': obj({'object': {'const': 'list'}, 'data': arr(ref('Model'))}, ['object', 'data']),
 'EndpointList': obj({'model_id': S, 'endpoints': arr(obj({'provider': S, 'region': S, 'status': {'enum': ['enabled', 'disabled', 'pending_legal']}}, ['provider', 'region', 'status']))}, ['model_id', 'endpoints']),
 'Generation': obj({'id': S, 'model': S, 'status': {'enum': ['held', 'captured', 'released', 'failed']}, 'amount_microkopecks': {'type': 'string', 'pattern': '^[0-9]+$'}, 'usage': ref('Usage')}, ['id', 'model', 'status']),
 'KeyInfo': obj({'id': S, 'name': S, 'enabled': B, 'rpm_limit': I, 'budget_microkopecks': {'type': 'string', 'pattern': '^[0-9]+$'}}, ['id', 'name', 'enabled']),
 'Credits': obj({'currency': {'const': 'RUB'}, 'available_microkopecks': {'type': 'string', 'pattern': '^[0-9]+$'}, 'held_microkopecks': {'type': 'string', 'pattern': '^[0-9]+$'}}, ['currency', 'available_microkopecks', 'held_microkopecks'])
}


def response(schema, description='Successful response'):
    return {'description': description, 'headers': {'X-Request-Id': {'description': 'Correlation ID; never contains a secret.', 'schema': S}}, 'content': {'application/json': {'schema': schema}}}


def operation(name, summary, result, request=None, phase='MVP'):
    responses = {'200': response(ref(result))}
    for code, text in [('400', 'Malformed request'), ('401', 'Invalid credentials'), ('402', 'Insufficient balance'), ('403', 'Forbidden tenant or capability'), ('404', 'Unknown resource'), ('409', 'Idempotency key conflict'), ('413', 'Body limit exceeded'), ('415', 'Unsupported media type'), ('422', 'Unsupported parameter or invalid schema'), ('429', 'Rate limited'), ('500', 'Internal failure'), ('502', 'Provider failure'), ('503', 'Provider or dependency unavailable')]:
        responses[code] = response(ref('Error'), text)
    responses['429']['headers'].update({k: {'description': v, 'schema': I} for k, v in {'x-ratelimit-limit-requests': 'Request limit per minute', 'x-ratelimit-remaining-requests': 'Remaining requests', 'x-ratelimit-reset-requests': 'Seconds until reset', 'Retry-After': 'Seconds before retry'}.items()})
    result = {'operationId': name, 'summary': summary, 'description': f'{summary}. Contract for phase {phase}; this specification does not mean the endpoint is implemented.', 'tags': ['Public API'], 'x-release-phase': phase, 'responses': responses}
    if request:
        result['parameters'] = [{'name': 'Idempotency-Key', 'in': 'header', 'description': 'Tenant-scoped idempotency key. Same key with a different body returns 409; expires after 24 hours.', 'schema': dict(type='string', minLength=1, maxLength=128)}]
        result['requestBody'] = {'required': True, 'content': {'multipart/form-data' if request == 'TranscriptionRequest' else 'application/json': {'schema': ref(request)}}}
    return result


def generate():
    def annotate_types(value):
        if isinstance(value, dict):
            if 'const' in value and 'type' not in value:
                value['type'] = 'boolean' if isinstance(value['const'], bool) else 'string'
            if 'enum' in value and all(isinstance(item, str) for item in value['enum']):
                value.setdefault('type', 'string')
            for item in value.values():
                annotate_types(item)
        elif isinstance(value, list):
            for item in value:
                annotate_types(item)
    annotate_types(schemas)
    paths = {}
    entries = [('/chat/completions', 'createChatCompletion', 'Create a chat completion', 'ChatCompletionResponse', 'ChatCompletionRequest', 'Release 0.5'), ('/responses', 'createResponse', 'Create a Responses API result', 'ResponsesResponse', 'ResponsesRequest', 'Beta'), ('/messages', 'createMessage', 'Create an Anthropic-compatible message', 'MessagesResponse', 'MessagesRequest', 'Beta'), ('/embeddings', 'createEmbedding', 'Create embeddings', 'EmbeddingsResponse', 'EmbeddingsRequest', 'Beta'), ('/rerank', 'rerank', 'Rerank documents', 'RerankResponse', 'RerankRequest', 'Beta'), ('/images/generations', 'generateImage', 'Generate images', 'ImageResponse', 'ImageRequest', 'Beta'), ('/audio/speech', 'generateSpeech', 'Generate speech audio', 'TranscriptionResponse', 'SpeechRequest', 'Beta'), ('/audio/transcriptions', 'transcribeAudio', 'Transcribe audio', 'TranscriptionResponse', 'TranscriptionRequest', 'Beta'), ('/models', 'listModels', 'List available models', 'ModelList', None, 'MVP'), ('/models/{id}/endpoints', 'listModelEndpoints', 'List model endpoints', 'EndpointList', None, 'Beta'), ('/generation', 'getGeneration', 'Get an owned generation', 'Generation', None, 'MVP'), ('/key', 'getKey', 'Inspect the current key without its secret', 'KeyInfo', None, 'MVP'), ('/credits', 'getCredits', 'Get the current tenant balance', 'Credits', None, 'MVP')]
    for path, name, summary, res, req, phase in entries:
        op = operation(name, summary, res, req, phase)
        if '{id}' in path:
            op['parameters'] = [{'name': 'id', 'in': 'path', 'required': True, 'description': 'URL-encoded model identifier.', 'schema': S}]
        if path == '/generation':
            op['parameters'] = [{'name': 'id', 'in': 'query', 'required': True, 'description': 'Generation ID owned by the authenticated tenant.', 'schema': S}]
        if path == '/audio/speech':
            op['responses']['200']['content'] = {'audio/mpeg': {'schema': {'type': 'string', 'format': 'binary'}}}
        if path in ['/chat/completions', '/responses', '/messages']:
            op['responses']['200']['content']['text/event-stream'] = {'schema': {'type': 'string', 'description': 'Endpoint-specific SSE frames; chat terminates with data: [DONE]. No cross-endpoint event-shape equivalence is promised.'}}
        paths[path] = {'post' if req else 'get': op}
    spec = {'openapi': '3.1.0', 'info': {'title': 'NeuroGateway public API', 'version': '0.1.0', 'description': 'Target public contract. Release 0.5 is the non-streaming chat slice. Future routes may return 501 until their release phase. Integer money is encoded as decimal strings to preserve JavaScript precision.', 'contact': {'name': 'NeuroGateway project', 'url': 'https://github.com/ilyaero1911/api-aggregator/issues'}}, 'servers': [{'url': 'http://127.0.0.1:8080/v1', 'description': 'Local development only'}], 'tags': [{'name': 'Public API', 'description': 'Bearer-authenticated public interface.'}], 'security': [{'BearerAuth': []}], 'paths': paths, 'components': {'securitySchemes': {'BearerAuth': {'type': 'http', 'scheme': 'bearer', 'description': 'Client API key. The secret is never returned by GET /key.'}}, 'schemas': schemas}}
    internal = copy.deepcopy(spec)
    internal['info'].update(title='NeuroGateway control plane', description='Separate session-authenticated control plane contract; not a public model-provider proxy.')
    internal['servers'][0]['url'] = 'http://127.0.0.1:8081/api/internal'
    internal['security'] = [{'SessionAuth': []}]
    internal['components']['securitySchemes'] = {'SessionAuth': {'type': 'apiKey', 'in': 'cookie', 'name': 'ng_session', 'description': 'HttpOnly Secure SameSite session; mutating calls also require X-CSRF-Token.'}}
    internal['tags'] = [{'name': 'Control plane', 'description': 'Web account, keys and balance.'}]
    internal['paths'] = {}
    internal['components']['schemas'].update({'Credentials': obj({'email': {'type': 'string', 'format': 'email'}, 'password': dict(type='string', minLength=12)}, ['email', 'password']), 'Account': obj({'id': S, 'email': S}, ['id', 'email']), 'CreateKey': obj({'name': S, 'rpm_limit': I}, ['name']), 'IssuedKey': obj({'id': S, 'secret': S}, ['id', 'secret']), 'Topup': obj({'amount_microkopecks': dict(type='string', pattern='^[1-9][0-9]*$')}, ['amount_microkopecks'])})
    for path, verb, name, res, req in [('/auth/register', 'post', 'register', 'Account', 'Credentials'), ('/auth/login', 'post', 'login', 'Account', 'Credentials'), ('/me', 'get', 'getMe', 'Account', None), ('/keys', 'post', 'issueKey', 'IssuedKey', 'CreateKey'), ('/keys/{id}', 'delete', 'revokeKey', 'KeyInfo', None), ('/balance', 'get', 'getBalance', 'Credits', None), ('/balance/topups', 'post', 'topupStub', 'Credits', 'Topup'), ('/usage', 'get', 'listUsage', 'Generation', None)]:
        op = operation(name, 'Control plane ' + name, res, req, 'Release 0.5')
        op['tags'] = ['Control plane']
        if path.startswith('/auth/'):
            op['security'] = []
        elif verb in ['post', 'delete']:
            op.setdefault('parameters', []).append({'name': 'X-CSRF-Token', 'in': 'header', 'required': True, 'description': 'Session-bound anti-CSRF token.', 'schema': S})
        if '{id}' in path:
            op.setdefault('parameters', []).append({'name': 'id', 'in': 'path', 'required': True, 'description': 'Owned API key identifier.', 'schema': S})
        internal['paths'][path] = {verb: op}
    standalone = {'$schema': 'https://json-schema.org/draft/2020-12/schema', '$id': 'https://neurogateway.local/schema/llm-request.schema.json', 'title': 'CanonicalChatRequest', **chat}
    standalone_response = {'$schema': standalone['$schema'], '$id': 'https://neurogateway.local/schema/llm-response.schema.json', 'title': 'CanonicalChatResponse', **copy.deepcopy(schemas['ChatCompletionResponse'])}
    standalone_response['properties']['usage'] = usage
    # Each document includes only reachable schemas; no unused contract copies.
    for document in [spec, internal]:
        available = document['components']['schemas']
        needed = set()
        def visit(value):
            if isinstance(value, dict):
                target = value.get('$ref', '')
                if target.startswith('#/components/schemas/'):
                    name = target.rsplit('/', 1)[1]
                    if name not in needed:
                        needed.add(name)
                        visit(available[name])
                for item in value.values():
                    visit(item)
            elif isinstance(value, list):
                for item in value:
                    visit(item)
        visit(document['paths'])
        document['components']['schemas'] = {name: value for name, value in available.items() if name in needed}
    for path, value in [('schema/openapi.yaml', spec), ('schema/internal.openapi.yaml', internal), ('schema/llm-request.schema.json', standalone), ('schema/llm-response.schema.json', standalone_response)]:
        (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    generate()
