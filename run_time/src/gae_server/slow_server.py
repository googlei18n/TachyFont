"""
  Copyright 2014 Google Inc. All rights reserved.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
"""

import webapp2
from os import path
from help import prepare_bundle
from time import sleep

BASE_DIR = path.dirname(__file__)


class SlowServer(webapp2.RequestHandler):

  def get(self):
    delay = self.request.get('delay') or ''
    if delay:
      sleep(int(delay))
    self.response.headers['Content-Type'] = 'text/plain'
    self.response.out.write('')
    


app = webapp2.WSGIApplication([
    ('/slow_server', SlowServer)
], debug=True)
